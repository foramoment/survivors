import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusSystem } from '../core/StatusEffects';
import { Enemy } from '../entities/Enemy';
import { levelSpatialHash } from '../core/SpatialHash';
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

    it('re-infecting keeps the stronger dps and the longer timer', () => {
        const enemy = makeEnemy();
        status.infect(enemy, { dps: 10, duration: 5, source: null });
        status.infect(enemy, { dps: 4, duration: 1, source: null });

        expect(enemy.infection?.dps).toBe(10);
        expect(enemy.infection?.timer).toBe(5);
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
