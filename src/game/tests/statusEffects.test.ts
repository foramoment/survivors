import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusSystem } from '../core/StatusEffects';
import { Enemy } from '../entities/Enemy';
import { levelSpatialHash } from '../../engine/SpatialHash';
import { damageSystem } from '../core/DamageSystem';

const TYPE = { name: 'Void Bat', hp: 100, speed: 100, damage: 5, xpValue: 1, emoji: '🦇' };

function makeEnemy(x = 0, y = 0): Enemy {
    return new Enemy(x, y, { ...TYPE });
}

describe('StatusSystem — infection', () => {
    let status: StatusSystem;

    beforeEach(() => {
        status = new StatusSystem();
        vi.restoreAllMocks();
    });

    it('ticks damage over time and expires', () => {
        const spy = vi.spyOn(damageSystem, 'dealDamage').mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });
        const enemy = makeEnemy();
        status.infect(enemy, { dps: 10, duration: 2, source: null });

        // Nothing before the first tick lands
        status.update(0.3, [enemy]);
        expect(spy).not.toHaveBeenCalled();

        status.update(0.4, [enemy]);
        expect(spy).toHaveBeenCalledTimes(1);

        // Runs out after its duration
        for (let i = 0; i < 40; i++) status.update(0.1, [enemy]);
        expect(enemy.infection).toBeNull();
    });

    it('a weaker infection does not land on top of a stronger one', () => {
        const enemy = makeEnemy();
        status.infect(enemy, { dps: 10, duration: 5, source: null });
        status.infect(enemy, { dps: 4, duration: 1, source: null });

        expect(enemy.infection?.dps).toBe(10);
        expect(enemy.infection?.timer).toBe(5);
    });

    it('the stronger infection replaces the weaker one whole', () => {
        // Including the timer. Merging field by field is what built infections
        // that never existed — see the next test.
        const enemy = makeEnemy();
        status.infect(enemy, { dps: 4, duration: 9, source: null, kind: 'spore' });
        status.infect(enemy, { dps: 40, duration: 2, source: null, kind: 'burn' });

        expect(enemy.infection?.dps).toBe(40);
        expect(enemy.infection?.timer).toBe(2);   // not the 9 it walked in with
        expect(enemy.infection?.kind).toBe('burn');
    });

    it('a mat re-infecting a burning enemy cannot adopt the burn', () => {
        // THE bug this rule exists for, reproduced.
        //
        // Kill Echo leaves a burn worth 9% of the target's MAX HP per second —
        // on a late Void Nexus body, 4320 dps — and it is flat, so it is meant
        // to land unmodified. The fungal mat the enemy is standing in then
        // re-infects it with its own 37 dps and its own source. The old merge
        // kept the burn's dps, took the mat's source and dropped the flat
        // marker, so the perk's burn started running through might and crit and
        // was billed to the mushroom.
        //
        // Measured consequence: Fungal Bloom reported 66% of all damage and 71%
        // of all kills in a run, with a best hit of 718,348. Almost none of it
        // was the mushroom.
        const weapon = { weaponId: 'spore_cloud', owner: { stats: { might: 1.36, critChance: 1, critDamage: 4 } } };
        const enemy = makeEnemy();
        enemy.maxHp = 48000;
        enemy.hp = 48000;

        status.infect(enemy, {
            dps: enemy.maxHp * 0.09, duration: 2.5, source: undefined, kind: 'burn', flat: true,
        });
        status.infect(enemy, { dps: 37, duration: 9, source: weapon, kind: 'spore' });

        expect(enemy.infection?.source).toBeUndefined();
        expect(enemy.infection?.flat).toBe(true);
        expect(enemy.infection?.timer).toBe(2.5);

        const spy = vi.spyOn(damageSystem, 'dealDamage').mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });
        status.update(0.7, [enemy]);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ skipModifiers: true }));
    });

    it('a percent-of-max-HP burn is cut against a boss', () => {
        // A boss is a health pool an order of magnitude past anything else on
        // the field, which is what a percentage of max health is worst against.
        const trash = makeEnemy();
        const boss = makeEnemy();
        boss.makeBoss();

        status.infect(trash, { dps: trash.maxHp * 0.09, duration: 3, source: null, flat: true });
        status.infect(boss, { dps: boss.maxHp * 0.09, duration: 3, source: null, flat: true });

        const trashShare = (trash.infection?.dps ?? 0) / trash.maxHp;
        const bossShare = (boss.infection?.dps ?? 0) / boss.maxHp;
        expect(bossShare).toBeCloseTo(trashShare * 0.25);
    });

    it('a weapon infection is still modified by the build', () => {
        // The flip side: only `flat` infections skip the pipeline. A weapon's
        // own damage-over-time has to keep scaling with might and crit, or
        // levelling the weapon that applied it would do nothing.
        const spy = vi.spyOn(damageSystem, 'dealDamage').mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });
        const enemy = makeEnemy();
        status.infect(enemy, { dps: 10, duration: 3, source: null });

        status.update(0.7, [enemy]);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ skipModifiers: false }));
    });

    it('a non-contagious carrier infects nobody when it dies', () => {
        const carrier = makeEnemy(0, 0);
        const neighbour = makeEnemy(30, 0);
        levelSpatialHash.clear();
        levelSpatialHash.insertAll([carrier, neighbour]);

        status.infect(carrier, { dps: 10, duration: 3, source: null });
        status.onEnemyDeath(carrier);

        expect(neighbour.infection).toBeNull();
    });

    it('a contagious carrier infects its neighbours on death', () => {
        const carrier = makeEnemy(0, 0);
        const near = makeEnemy(40, 0);
        const far = makeEnemy(900, 0);
        levelSpatialHash.clear();
        levelSpatialHash.insertAll([carrier, near, far]);

        status.infect(carrier, {
            dps: 10, duration: 3, source: null, contagious: true, spreadRadius: 100,
        });
        status.onEnemyDeath(carrier);

        expect(near.infection).not.toBeNull();
        expect(near.infection?.dps).toBeLessThan(10); // each jump is weaker
        expect(far.infection).toBeNull();
    });

    it('contagion burns out after a few generations', () => {
        let carrier = makeEnemy(0, 0);
        status.infect(carrier, {
            dps: 10, duration: 3, source: null, contagious: true, spreadRadius: 100,
        });

        // Pass the infection down a chain of hosts
        let generations = 0;
        for (let i = 0; i < 10; i++) {
            const next = makeEnemy(40, 0);
            levelSpatialHash.clear();
            levelSpatialHash.insertAll([carrier, next]);
            status.onEnemyDeath(carrier);
            if (!next.infection) break;
            generations++;
            carrier = next;
        }

        expect(generations).toBeLessThanOrEqual(3);
        expect(generations).toBeGreaterThan(0);
    });
});

describe('StatusSystem — stun', () => {
    it('a stunned enemy does not move toward the player', () => {
        const status = new StatusSystem();
        const enemy = makeEnemy(100, 0);
        status.stun(enemy, 1);

        enemy.update(0.1, { x: 0, y: 0 });
        expect(enemy.pos.x).toBe(100);

        // ...and starts moving again once it wears off
        for (let i = 0; i < 12; i++) enemy.update(0.1, { x: 0, y: 0 });
        expect(enemy.pos.x).toBeLessThan(100);
    });

    it('the longest stun wins', () => {
        const status = new StatusSystem();
        const enemy = makeEnemy();
        status.stun(enemy, 2);
        status.stun(enemy, 0.5);
        expect(enemy.stunTimer).toBe(2);
    });
});

describe('stun diminishing returns', () => {
    const status = new StatusSystem();
    const freshEnemy = () => makeEnemy();

    it('a stun cannot be re-applied until the target recovers', () => {
        const enemy = freshEnemy();
        status.stun(enemy, 1);
        expect(enemy.stunTimer).toBeCloseTo(1);

        // Run the stun out
        enemy.update(1.1);
        expect(enemy.stunTimer).toBeLessThanOrEqual(0);

        // Immediately restunning it is what let a duration build lock the arena
        status.stun(enemy, 1);
        expect(enemy.stunTimer).toBeLessThanOrEqual(0);
    });

    it('recovers after the immunity window and can be stunned again', () => {
        const enemy = freshEnemy();
        status.stun(enemy, 1);
        enemy.update(1.1);

        // Recovery only ticks while the enemy is free to move
        for (let i = 0; i < 30; i++) status.update(0.1, [enemy]);

        status.stun(enemy, 1);
        expect(enemy.stunTimer).toBeGreaterThan(0);
    });

    it('caps stun uptime at a third however hard a build spams it', () => {
        const enemy = freshEnemy();
        const STEP = 0.05;
        let stunned = 0;

        for (let i = 0; i < 400; i++) {
            // A field that refreshes the freeze every single frame
            status.stun(enemy, 0.6);
            if (enemy.stunTimer > 0) stunned++;
            enemy.update(STEP);
            status.update(STEP, [enemy]);
        }

        expect(stunned / 400).toBeLessThan(0.4);
    });

    it('a stun in progress cannot be topped back up', () => {
        // This is the exact shape of the exploit: a field re-applying its
        // freeze every frame would otherwise hold the timer at full forever
        const enemy = freshEnemy();
        status.stun(enemy, 0.5);
        enemy.update(0.2);
        status.stun(enemy, 2);
        expect(enemy.stunTimer).toBeLessThan(0.5);
    });

    it('clear resets the immunity too', () => {
        const enemy = freshEnemy();
        status.stun(enemy, 1);
        status.clear([enemy]);
        expect(enemy.stunTimer).toBe(0);
        expect(enemy.stunImmunity).toBe(0);
    });
});
