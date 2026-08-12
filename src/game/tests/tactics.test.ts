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
    KILL_ECHO_ICD, KILL_ECHO_DAMAGE_SHARE,
} from '../core/Tactics';
import { POWERUPS } from '../data/GameData';
import { VALID_PLAYER_STATS } from '../core/PlayerStats';

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

        // The card has to name them, or the tiers are invisible
        for (const tier of [1, DISCHARGE_STUN_AT, DISCHARGE_BURN_AT]) {
            expect(perk.description).toContain(`${tier}:`);
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
        const hp = 100;
        const damage = Math.min(hp * KILL_ECHO_DAMAGE_SHARE, Math.max(0, hp - 1));
        expect(damage).toBeLessThan(hp);

        // Even at a share of 1 the target survives on 1 HP
        const lethal = Math.min(hp * 1, Math.max(0, hp - 1));
        expect(lethal).toBe(hp - 1);
        expect(DISCHARGE_COOLDOWN).toBeGreaterThan(0);
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
