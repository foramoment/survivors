import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../core/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import {
    buildUpgradeOptions,
    getPowerupValue,
    formatPowerupBonus,
    WEAPON_SLOT_CAP,
    POWERUP_STACK_CAP,
} from '../core/UpgradePool';
import { WEAPONS, POWERUPS } from '../data/GameData';
import { i18n } from '../core/I18n';
import { Player } from '../entities/Player';

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('UpgradePool', () => {
    it('always offers at least one owned-weapon upgrade when one exists', () => {
        const rng = mulberry32(42);
        for (let i = 0; i < 200; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: new Map([[WEAPONS[0].id, 3]]),
                powerupLevels: new Map(),
                count: 3,
                rng,
            });
            const hasOwned = options.some(o => o.type === 'weapon' && o.data.id === WEAPONS[0].id);
            expect(hasOwned).toBe(true);
        }
    });

    it('heavily favors owned weapons: an owned weapon appears far more often than a specific new one', () => {
        const rng = mulberry32(7);
        let ownedSeen = 0;
        const trials = 300;
        for (let i = 0; i < trials; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: new Map([[WEAPONS[2].id, 2]]),
                powerupLevels: new Map(),
                count: 3,
                rng,
            });
            if (options.some(o => o.type === 'weapon' && o.data.id === WEAPONS[2].id)) ownedSeen++;
        }
        // With the guarantee this should be 100%; the old uniform pool gave ~10%
        expect(ownedSeen / trials).toBeGreaterThan(0.9);
    });

    it('stops offering new weapons once the slot cap is reached', () => {
        const owned = new Map(WEAPONS.slice(0, WEAPON_SLOT_CAP).map(w => [w.id, 2] as [string, number]));
        const rng = mulberry32(99);
        for (let i = 0; i < 100; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: owned,
                powerupLevels: new Map(),
                count: 6,
                rng,
            });
            for (const o of options) {
                if (o.type === 'weapon') {
                    expect(owned.has(o.data.id)).toBe(true);
                }
            }
        }
    });

    it('excludes fully evolved weapons and capped powerups', () => {
        const weaponLevels = new Map([[WEAPONS[0].id, 6]]);
        const powerupLevels = new Map(POWERUPS.map(p => [p.name, POWERUP_STACK_CAP] as [string, number]));
        const options = buildUpgradeOptions({ weaponLevels, powerupLevels, count: 6, rng: mulberry32(1) });
        for (const o of options) {
            if (o.type === 'weapon') expect(o.data.id).not.toBe(WEAPONS[0].id);
            expect(o.type).not.toBe('powerup');
        }
    });

    it('never returns duplicate options in one draw', () => {
        const rng = mulberry32(5);
        for (let i = 0; i < 100; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: new Map([[WEAPONS[0].id, 1], [WEAPONS[1].id, 5]]),
                powerupLevels: new Map(),
                count: 6,
                rng,
            });
            const keys = options.map(o => `${o.type}:${o.data.id ?? o.data.name}`);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    describe('powerup stacking', () => {
        it('each stack is 25% stronger than the previous', () => {
            expect(getPowerupValue(0.08, 0)).toBeCloseTo(0.08);
            expect(getPowerupValue(0.08, 1)).toBeCloseTo(0.1);
            expect(getPowerupValue(0.08, 4)).toBeCloseTo(0.08 * 1.25 ** 4);
        });

        it('preserves sign for negative modifiers (cooldown)', () => {
            expect(getPowerupValue(-0.06, 3)).toBeLessThan(-0.06);
        });

        it('stackGrowth: 1 makes a powerup stack flat', () => {
            expect(getPowerupValue(0.1, 0, 1)).toBeCloseTo(0.1);
            expect(getPowerupValue(0.1, 7, 1)).toBeCloseTo(0.1);
        });

        it('regen is flat and caps below 1 HP/s at max stacks', () => {
            const regen = POWERUPS.find(p => p.type === 'regen')!;
            expect(regen.stackGrowth).toBe(1);

            let total = 0;
            for (let stack = 0; stack < POWERUP_STACK_CAP; stack++) {
                total += getPowerupValue(regen.value, stack, regen.stackGrowth);
            }
            expect(total).toBeCloseTo(0.8);
            expect(total).toBeLessThan(1);
        });

        it('formats percent and flat bonuses', () => {
            // i18n picks the host locale by default, so pin it for this test
            i18n.setLang('en');
            expect(formatPowerupBonus('might', 0.08)).toBe('+8%');
            expect(formatPowerupBonus('cooldown', -0.06)).toBe('−6%');
            expect(formatPowerupBonus('maxHp', 15)).toBe('+15 Max HP');
            expect(formatPowerupBonus('magnet', 30)).toBe('+30 pull range');
        });

        it('flat bonus units follow the active language', () => {
            i18n.setLang('ru');
            expect(formatPowerupBonus('maxHp', 15)).toBe('+15 к макс. HP');
            expect(formatPowerupBonus('might', 0.08)).toBe('+8%'); // percentages are language-neutral
            i18n.setLang('en');
        });
    });
});

describe('Player XP curve', () => {
    it('no longer spams early levels (first level costs more than 1 XP)', () => {
        const player = new Player(0, 0);
        expect(player.nextLevelXp).toBeGreaterThanOrEqual(4);
    });

    it('grows steadily without exploding', () => {
        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        const costs: number[] = [player.nextLevelXp];
        for (let i = 0; i < 20; i++) {
            player.levelUp();
            costs.push(player.nextLevelXp);
        }
        // Monotonic growth
        for (let i = 1; i < costs.length; i++) {
            expect(costs[i]).toBeGreaterThan(costs[i - 1]);
        }
        // Level ~21 should be reachable in a run (cost in the low hundreds)
        expect(costs[20]).toBeLessThan(500);
    });
});
