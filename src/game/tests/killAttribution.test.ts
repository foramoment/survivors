import { describe, it, expect } from 'vitest';
import { RunStatsTracker, TTK_SMOOTHING } from '../core/RunStats';
import { damageSystem, weaponIdOf } from '../core/DamageSystem';

/**
 * Damage is an input, kills are the output, and the run summary only measured
 * the input. A real Void Nexus death: 442k damage at 2123/s, 419 kills, and the
 * player's read of it was "the black hole does a lot of damage and kills almost
 * nobody" — which was correct, and which no number on the screen could confirm.
 *
 * These tests cover the three things that were added to say it: who landed the
 * killing blow, how much of the damage became a corpse, and how long one
 * arriving enemy now takes to kill.
 */

function fakeEnemy(hp: number) {
    return {
        hp,
        maxHp: hp,
        isDead: false,
        lastHitBy: null as string | null,
        takeDamage(amount: number) {
            this.hp -= amount;
            if (this.hp <= 0) this.isDead = true;
        },
    };
}

/** A weapon owned by a player with no crit and no might, so damage is literal */
function fakeWeapon(weaponId: string) {
    return {
        weaponId,
        owner: { stats: { critChance: 0, critDamage: 2, might: 1, firstStrike: 0 } },
    };
}

describe('killing-blow attribution', () => {
    it('names the weapon that landed the last hit, through a projectile', () => {
        const weapon = fakeWeapon('void_bolt');
        // Weapons rarely touch anything themselves — a projectile or zone does
        const projectile = { source: weapon };
        const enemy = fakeEnemy(100);

        damageSystem.dealDamage({
            baseDamage: 40, source: projectile, target: enemy, position: { x: 0, y: 0 },
        });
        expect(enemy.lastHitBy).toBe('void_bolt');
    });

    it('the last weapon to hit gets the kill, not the one that did most of it', () => {
        const chip = { source: fakeWeapon('singularity_orb') };
        const finisher = { source: fakeWeapon('lightning_chain') };
        const enemy = fakeEnemy(100);

        damageSystem.dealDamage({ baseDamage: 90, source: chip, target: enemy, position: { x: 0, y: 0 } });
        damageSystem.dealDamage({ baseDamage: 90, source: finisher, target: enemy, position: { x: 0, y: 0 } });

        expect(enemy.isDead).toBe(true);
        // This asymmetry IS the measurement: the orb ground it down, the chain
        // finished it, and the run needs to be able to tell those apart.
        expect(enemy.lastHitBy).toBe('lightning_chain');
    });

    it('environmental damage belongs to nobody', () => {
        const enemy = fakeEnemy(100);
        damageSystem.dealDamage({
            baseDamage: 200, source: null, target: enemy, position: { x: 0, y: 0 },
            skipModifiers: true,
        });
        expect(enemy.lastHitBy).toBeNull();
        expect(weaponIdOf(null)).toBeNull();
    });
});

describe('per-weapon tally', () => {
    it('separates a weapon that grinds from a weapon that finishes', () => {
        const run = new RunStatsTracker();

        // The reported shape: one weapon pours damage into a held crowd, another
        // does far less and takes almost every kill.
        for (let i = 0; i < 100; i++) run.recordHit(100, false, 'singularity_orb');
        for (let i = 0; i < 10; i++) {
            run.recordHit(50, false, 'lightning_chain');
            run.recordKill(500, 'lightning_chain');
        }

        const orb = run.stats.weapons.get('singularity_orb')!;
        const chain = run.stats.weapons.get('lightning_chain')!;

        expect(orb.damage).toBe(10000);
        expect(orb.kills).toBe(0);
        expect(chain.damage).toBe(500);
        expect(chain.kills).toBe(10);
        // 95% of the damage, none of the corpses — the number that was missing
        expect(orb.damage / run.stats.totalDamage).toBeCloseTo(0.952, 2);
    });

    it('a weapon that never connects is absent rather than a zero row', () => {
        const run = new RunStatsTracker();
        run.recordHit(10, false, 'void_bolt');
        expect(run.stats.weapons.has('void_bolt')).toBe(true);
        expect(run.stats.weapons.has('frost_nova')).toBe(false);
    });

    it('unattributed kills still count toward the run, just not toward a weapon', () => {
        const run = new RunStatsTracker();
        run.recordKill(300, null);   // a meteor, or Static Discharge
        expect(run.stats.weapons.size).toBe(0);
        expect(run.stats.hpDestroyed).toBe(300);
    });
});

describe('conversion: how much damage became a corpse', () => {
    it('counts the whole health bar of the dead, whoever chipped it', () => {
        const run = new RunStatsTracker();
        // Two weapons split one 1000 HP enemy, and 400 damage is sprayed over
        // survivors who walk away
        run.recordHit(600, false, 'a');
        run.recordHit(400, false, 'a');
        run.recordHit(400, false, 'b');
        run.recordKill(1000, 'b');

        expect(run.stats.totalDamage).toBe(1400);
        expect(run.stats.hpDestroyed).toBe(1000);
        expect(run.stats.hpDestroyed / run.stats.totalDamage).toBeCloseTo(0.714, 2);
    });
});

describe('time to kill', () => {
    /** One second of the run: `amount` damage dealt, then the clock closes */
    function second(run: RunStatsTracker, amount: number) {
        run.recordHit(amount, false, 'w');
        run.update(1);
    }

    it('is enemy health over damage, in seconds', () => {
        const run = new RunStatsTracker();
        for (let i = 0; i < 60; i++) run.recordSpawn(3000);
        for (let i = 0; i < 60; i++) second(run, 1000);

        expect(run.stats.arenaHp).toBeCloseTo(3000, 0);
        expect(run.stats.dps).toBeCloseTo(1000, 0);
        expect(run.stats.ttk).toBeCloseTo(3, 1);
    });

    it('is defined even when the run is killing nothing at all', () => {
        // The exact case that prompted this: the damage counter runs and not a
        // single enemy dies. A kills-based average would be blank here, which is
        // precisely when the player needs the number.
        const run = new RunStatsTracker();
        for (let i = 0; i < 40; i++) run.recordSpawn(3000);
        for (let i = 0; i < 40; i++) second(run, 80);

        expect(run.stats.ttk).toBeGreaterThan(30);
        expect([...run.stats.weapons.values()].every(w => w.kills === 0)).toBe(true);
    });

    it('describes the end of the run, not its average', () => {
        const run = new RunStatsTracker();
        // Five minutes of a build that works, then a minute where it stops
        for (let i = 0; i < 300; i++) { run.recordSpawn(500); second(run, 5000); }
        const whileWorking = run.stats.ttk;

        for (let i = 0; i < 60; i++) { run.recordSpawn(9000); second(run, 500); }

        expect(whileWorking).toBeLessThan(0.5);
        // A run average would still be reading ~1s here and calling it fine
        expect(run.stats.ttk).toBeGreaterThan(10);
    });

    it('is zero before any damage has been dealt', () => {
        const run = new RunStatsTracker();
        run.recordSpawn(500);
        expect(run.stats.ttk).toBe(0);
    });

    it('a reset run carries nothing over', () => {
        const run = new RunStatsTracker();
        run.recordSpawn(3000);
        second(run, 1000);
        run.recordKill(3000, 'w');
        run.reset();

        expect(run.stats.ttk).toBe(0);
        expect(run.stats.hpDestroyed).toBe(0);
        expect(run.stats.weapons.size).toBe(0);
    });

    it('smooths over roughly ten seconds, not one', () => {
        // A single lucky volley must not move the number much, or it stops
        // meaning "your build" and starts meaning "your last second"
        const run = new RunStatsTracker();
        for (let i = 0; i < 60; i++) { run.recordSpawn(1000); second(run, 1000); }
        const before = run.stats.dps;
        second(run, 50000);

        expect(run.stats.dps).toBeLessThan(before + 50000 * (1 - TTK_SMOOTHING) + 1);
        expect(run.stats.dps).toBeGreaterThan(before);
    });
});
