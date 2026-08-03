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
    formatStatValue,
    formatStatPreview,
    WEAPON_SLOT_CAP,
    POWERUP_STACK_CAP,
    SIGNATURE_WEAPONS,
    canOfferWeapon,
} from '../core/UpgradePool';
import { CLASSES, WEAPONS, POWERUPS } from '../data/GameData';
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

describe('Signature weapons', () => {
    it('every class owns exactly one, and no two classes share', () => {
        expect(SIGNATURE_WEAPONS.size).toBe(CLASSES.length);
        for (const cls of CLASSES) {
            expect(SIGNATURE_WEAPONS.get(cls.weaponId), cls.id).toBe(cls.id);
        }
    });

    it('a signature weapon is only offered to its own class', () => {
        const storm = CLASSES.find(c => c.id === 'storm_mage')!;
        expect(canOfferWeapon(storm.weaponId, 'storm_mage')).toBe(true);
        expect(canOfferWeapon(storm.weaponId, 'berserker')).toBe(false);
        // Everything nobody has claimed stays in the shared pool
        expect(canOfferWeapon('chrono_disc', 'berserker')).toBe(true);
    });

    it('never draws another class into a run as a new weapon', () => {
        const rng = mulberry32(7);
        const foreign = CLASSES.filter(c => c.id !== 'berserker').map(c => c.weaponId);

        for (let i = 0; i < 300; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: new Map(),
                powerupLevels: new Map(),
                classId: 'berserker',
                count: 4,
                rng,
            });
            const drawn = options.filter(o => o.type === 'weapon').map(o => o.data.id);
            for (const id of drawn) expect(foreign, id).not.toContain(id);
        }
    });

    it('still offers your own signature weapon for levelling', () => {
        const rng = mulberry32(11);
        const berserker = CLASSES.find(c => c.id === 'berserker')!;
        let seen = false;

        for (let i = 0; i < 200 && !seen; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: new Map([[berserker.weaponId, 3]]),
                powerupLevels: new Map(),
                classId: 'berserker',
                count: 3,
                rng,
            });
            seen = options.some(o => o.type === 'weapon' && o.data.id === berserker.weaponId);
        }
        expect(seen).toBe(true);
    });

    it('leaves enough shared weapons to fill every slot', () => {
        const shared = WEAPONS.filter(w => !SIGNATURE_WEAPONS.has(w.id));
        // Signature + shared must cover WEAPON_SLOT_CAP or a run cannot fill up
        expect(shared.length + 1).toBeGreaterThanOrEqual(WEAPON_SLOT_CAP);
    });
});

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
        it('every stack is worth exactly the base value', () => {
            expect(getPowerupValue(0.08, 0)).toBeCloseTo(0.08);
            expect(getPowerupValue(0.08, 1)).toBeCloseTo(0.08);
            expect(getPowerupValue(0.08, 7)).toBeCloseTo(0.08);
        });

        it('preserves sign for negative modifiers (cooldown)', () => {
            expect(getPowerupValue(-0.06, 3)).toBeCloseTo(-0.06);
        });

        it('a powerup can still opt into a compounding curve', () => {
            expect(getPowerupValue(0.1, 0, 1.25)).toBeCloseTo(0.1);
            expect(getPowerupValue(0.1, 3, 1.25)).toBeCloseTo(0.1 * 1.25 ** 3);
        });

        it('regen caps below 1 HP/s at max stacks', () => {
            const regen = POWERUPS.find(p => p.type === 'regen')!;

            let total = 0;
            for (let stack = 0; stack < (regen.maxStacks ?? POWERUP_STACK_CAP); stack++) {
                total += getPowerupValue(regen.value, stack, regen.stackGrowth);
            }
            expect(total).toBeCloseTo(0.8);
            expect(total).toBeLessThan(1);
        });

        it('no powerup can multiply its stat past what a card promises', () => {
            // The ceiling of every percentage stat, read straight off the pool.
            // These are the numbers that decide whether a build is a build or
            // an off switch — a regression here is a balance bug, not a typo.
            const ceilings: Record<string, number> = {
                might: 0.36,        // x1.36 damage
                critChance: 0.4,    // 40%, never a guaranteed crit on its own
                critDamage: 2.0,    // x2 -> x4
                cooldown: -0.4,     // x0.6
                duration: 0.8,      // x1.8
                area: 0.64,
                moveSpeed: 0.15,    // the player already outruns every enemy
            };
            for (const [type, expected] of Object.entries(ceilings)) {
                const powerup = POWERUPS.find(p => p.type === type)!;
                const cap = powerup.maxStacks ?? POWERUP_STACK_CAP;
                let total = 0;
                for (let stack = 0; stack < cap; stack++) {
                    total += getPowerupValue(powerup.value, stack, powerup.stackGrowth);
                }
                expect(total, type).toBeCloseTo(expected);
            }
        });

        it('a powerup can cap its own stacks below the global cap', () => {
            const spare = POWERUPS.find(p => p.id === 'extra_roll')!;
            expect(spare.maxStacks).toBe(2);

            // At its own cap it stops being offered, even though the global
            // cap is 8 — otherwise the draw becomes a menu you shop in
            const options = buildUpgradeOptions({
                weaponLevels: new Map(),
                powerupLevels: new Map([[spare.name, 2]]),
                count: 40,
                rng: mulberry32(7),
            });
            expect(options.some(o => o.data.id === 'extra_roll')).toBe(false);
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

describe('stat previews', () => {
    it('shows multiplier stats as a percentage', () => {
        // `might: 1.24` means nothing on a card; 124% does
        expect(formatStatValue('might', 1.24)).toBe('124%');
        expect(formatStatPreview('might', 1.24, 1.32)).toBe('124% → 132%');
    });

    it('shows flat stats as plain numbers', () => {
        expect(formatStatValue('armor', 3)).toBe('3');
        expect(formatStatPreview('maxHp', 130, 145)).toBe('130 → 145');
    });

    it('keeps one decimal on small flat values', () => {
        expect(formatStatValue('regen', 0.3)).toBe('0.3');
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

describe('Stat ceilings', () => {
    it('crit chance can never pass certainty, however it is raised', () => {
        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        // A Berserker gains +1% crit per level and reaches 100% on class growth
        // alone around level 35 — this is what a long run actually does
        player.perLevel = { stat: 'critChance', value: 0.01 };
        for (let i = 0; i < 200; i++) player.levelUp();
        expect(player.stats.critChance).toBe(1);
    });

    it('stops offering a perk whose stat is already maxed', () => {
        const atCap = buildUpgradeOptions({
            weaponLevels: new Map(),
            powerupLevels: new Map(),
            stats: { critChance: 1 },
            count: 40,
        });
        expect(atCap.some(o => o.type === 'powerup' && o.data.type === 'critChance')).toBe(false);

        // ...and still offers it below the cap, so the filter is not a blanket
        const below = buildUpgradeOptions({
            weaponLevels: new Map(),
            powerupLevels: new Map(),
            stats: { critChance: 0.9 },
            count: 40,
        });
        expect(below.some(o => o.type === 'powerup' && o.data.type === 'critChance')).toBe(true);
    });
});
