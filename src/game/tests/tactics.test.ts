import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../../engine/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import { Player } from '../entities/Player';
import { RepairCell } from '../entities/RepairCell';
import { adrenalineMultiplier, dischargeThreshold, dischargeRadius, DISCHARGE_COOLDOWN, ADRENALINE_THRESHOLD, REPAIR_LIFETIME } from '../core/Tactics';
import { POWERUPS } from '../data/GameData';
import { VALID_PLAYER_STATS } from '../core/PlayerStats';

describe('Tactics powerups', () => {
    it('every powerup type is a declared player stat', () => {
        for (const powerup of POWERUPS) {
            expect(VALID_PLAYER_STATS as readonly string[], powerup.id).toContain(powerup.type);
        }
    });

    it('the four tactics exist', () => {
        const tactics = ['static_discharge', 'kill_echo', 'adrenal_surge', 'vital_siphon'];
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

describe('Adrenal Surge', () => {
    it('does nothing while healthy', () => {
        expect(adrenalineMultiplier(100, 100, 0.3)).toBe(1);
        expect(adrenalineMultiplier(50, 100, 0.3)).toBe(1);
    });

    it('kicks in below the threshold', () => {
        const hp = 100 * ADRENALINE_THRESHOLD - 1;
        expect(adrenalineMultiplier(hp, 100, 0.3)).toBeCloseTo(1.3);
    });

    it('is inert without the perk', () => {
        expect(adrenalineMultiplier(5, 100, 0)).toBe(1);
    });

    it('drives both damage and move speed off one state', () => {
        const player = new Player(0, 0);
        player.maxHp = 100;
        player.stats.adrenaline = 0.5;

        player.hp = 100;
        expect(player.effectiveMight).toBeCloseTo(player.stats.might);

        player.hp = 20;
        expect(player.effectiveMight).toBeCloseTo(player.stats.might * 1.5);
        expect(player.adrenaline).toBeCloseTo(1.5);
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
