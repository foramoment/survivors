import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../../engine/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import { RepairCell } from '../entities/RepairCell';
import {
    dischargeThreshold, dischargeRadius, DISCHARGE_COOLDOWN, REPAIR_LIFETIME,
    DISCHARGE_MAX_STACKS, DISCHARGE_STUN_AT, DISCHARGE_BURN_AT,
    KILL_ECHO_ICD, KILL_ECHO_DAMAGE_SHARE, KILL_ECHO_BURN_SHARE,
    killEchoDamage, killEchoBurnDps,
} from '../core/Tactics';
import { POWERUPS } from '../data/GameData';
import { VALID_PLAYER_STATS } from '../core/PlayerStats';
import { RU } from '../data/locales/ru';

describe('Tactics powerups', () => {
    it('every powerup type is a declared player stat', () => {
        for (const powerup of POWERUPS) {
            expect(VALID_PLAYER_STATS as readonly string[], powerup.id).toContain(powerup.type);
        }
    });

    it('the four tactics exist', () => {
        const tactics = ['static_discharge', 'kill_echo', 'vital_siphon'];
        for (const id of tactics) {
            expect(POWERUPS.find(p => p.id === id), id).toBeDefined();
        }
    });

    it('every powerup stacks flat and declares its own cap', () => {
        // Stacking is flat by default now; a compounding curve is what turned
        // "+18% duration" into +357% at the shared 8-stack cap
        for (const powerup of POWERUPS) {
            expect(powerup.stackGrowth ?? 1, powerup.id).toBe(1);
            expect(powerup.maxStacks, powerup.id).toBeGreaterThan(0);
        }
    });

    it('projectile speed is gone from the pool', () => {
        expect(POWERUPS.some(p => p.type === 'speed')).toBe(false);
    });
});

describe('Static Discharge', () => {
    it('costs the same to charge however many stacks you have', () => {
        // It used to be `26 x stacks`, which made the perk's DPS exactly
        // constant: bigger blast, proportionally longer wait. Eight picks
        // bought a lumpier version of one pick.
        expect(dischargeThreshold(4)).toBe(dischargeThreshold(1));
    });

    it('is unreachable at zero stacks', () => {
        expect(dischargeThreshold(0)).toBe(Infinity);
    });

    it('every stack is a bigger bang, never a faster one', () => {
        expect(dischargeRadius(4)).toBeGreaterThan(dischargeRadius(1));
    });

    it('is three tiers of behaviour, not eight of the same number', () => {
        // The objection was structural, not numeric: buying the same event
        // eight times is the flat multiplier core/Tactics exists to replace.
        const perk = POWERUPS.find(p => p.id === 'static_discharge')!;
        expect(perk.maxStacks).toBe(DISCHARGE_MAX_STACKS);
        expect(DISCHARGE_MAX_STACKS).toBe(3);

        // Every tier past the first must unlock something, and land inside the
        // cap — a tier nobody can reach is a tier that does not exist
        expect(DISCHARGE_STUN_AT).toBeGreaterThan(1);
        expect(DISCHARGE_BURN_AT).toBeGreaterThan(DISCHARGE_STUN_AT);
        expect(DISCHARGE_BURN_AT).toBeLessThanOrEqual(DISCHARGE_MAX_STACKS);

        // The card has to name them, or the tiers are invisible — in EVERY
        // language. Game-data strings have no English twin in the locale file
        // (GameData is the fallback), so a translation is exactly the place a
        // tier can silently go missing.
        const ru = RU['powerup.static_discharge.desc'];
        for (const tier of [1, DISCHARGE_STUN_AT, DISCHARGE_BURN_AT]) {
            expect(perk.description, 'en').toContain(`${tier}:`);
            expect(ru, 'ru').toContain(`${tier}:`);
        }
    });
});

describe('Kill Echo', () => {
    it('trades frequency for size — fewer stacks, harder blast', () => {
        // Play report: it proc'd often enough to be background and hit softly
        // enough that nothing registered. The internal cooldown already bounded
        // the rate, so the late stacks were buying nothing you could feel.
        const perk = POWERUPS.find(p => p.id === 'kill_echo')!;
        expect(perk.maxStacks).toBe(3);
        expect(perk.value * perk.maxStacks).toBeCloseTo(0.3);

        // Slower than it was (1.6s), so a blast is an event you look up at
        expect(KILL_ECHO_ICD).toBeGreaterThan(2);
        // ...and heavier than it was (0.3 of current HP)
        expect(KILL_ECHO_DAMAGE_SHARE).toBeGreaterThan(0.4);
    });

    it('still cannot chain, however hard it hits', () => {
        // The non-lethal rule is what makes a cascade impossible by
        // construction rather than unlikely by tuning, so raising the share
        // must not touch it: no echo makes a corpse, so no echo makes an echo.
        // The invariant, at every health a target can be at: whatever the
        // corpse was worth, the body it caught walks away with at least 1 HP.
        for (const hp of [1, 2, 7, 100, 48_000]) {
            expect(hp - killEchoDamage(1e9, hp, false)).toBeGreaterThanOrEqual(1);
        }
        expect(DISCHARGE_COOLDOWN).toBeGreaterThan(0);
    });

    it('cannot be worth more than the body that produced it', () => {
        // Failure mode #2, which had moved rather than been fixed: a share of
        // the target's health is enormous when the target is a boss, so a
        // player melted a boss by farming the trash walking around it. Measured
        // on a real run — the boss bar visibly collapsed while the player
        // fought its escort.
        const TRASH = 48_000;      // a late Void Nexus body
        const BOSS = 2_500_000;    // the same body times a boss multiplier

        const onTrash = killEchoDamage(TRASH, TRASH, false);
        const onBoss = killEchoDamage(TRASH, BOSS, true);

        // A trash corpse cannot take a boss-sized bite out of a boss
        expect(onBoss).toBeLessThanOrEqual(onTrash);
        expect(onBoss / BOSS).toBeLessThan(0.02);

        // ...and the same ceiling applies to the burn it leaves behind, which
        // is where the boss melt actually came from
        expect(killEchoBurnDps(TRASH, BOSS)).toBe(killEchoBurnDps(TRASH, TRASH));
    });

    it('is unchanged when everything on the field is the same size', () => {
        // The corpse cap must be invisible in the case it was not written for:
        // trash killing trash is where this perk spends its whole life.
        const HP = 500;
        expect(killEchoDamage(HP, HP, false)).toBeCloseTo(HP * KILL_ECHO_DAMAGE_SHARE);
        expect(killEchoBurnDps(HP, HP)).toBeCloseTo(HP * KILL_ECHO_BURN_SHARE);
    });
});

describe('Repair cell', () => {
    it('expires so healing cannot be banked', () => {
        const cell = new RepairCell(0, 0);
        cell.update(REPAIR_LIFETIME + 0.1);
        expect(cell.isDead).toBe(true);
    });

    it('drifts only at very short range — no magnet pickup from safety', () => {
        const far = new RepairCell(200, 0);
        far.update(0.1, { x: 0, y: 0 });
        expect(far.pos.x).toBeCloseTo(200);

        const near = new RepairCell(40, 0);
        near.update(0.1, { x: 0, y: 0 });
        expect(near.pos.x).toBeLessThan(40);
    });
});
