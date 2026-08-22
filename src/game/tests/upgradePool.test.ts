import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../../engine/Input', () => ({
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
    effectivePowerup,
    WEAPON_SLOT_CAP,
    POWERUP_STACK_CAP,
    SIGNATURE_WEAPONS,
    canOfferWeapon,
} from '../core/UpgradePool';
import { CLASSES, WEAPONS, POWERUPS } from '../data/GameData';
import { i18n } from '../core/I18n';
import { Player } from '../entities/Player';
import { addStat, DEFAULT_PLAYER_STATS, isStatModified } from '../core/PlayerStats';

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

        it('regen tops out at a trickle, and the CAP is what bounds it', () => {
            // Health is a budget for the whole run (see core/ContactDamage), so
            // regen may not be a bar that refills between fights. The value per
            // stack is a round 1% on purpose — an earlier cut solved for an
            // exact recovery time, landed on 0.35%, and the card rendered as
            // "+0%" because that is what Math.round(0.0035 * 100) is.
            //
            // So the cap does the balancing. Widen this band rather than
            // shaving the per-stack value if the pacing needs a nudge.
            const regen = POWERUPS.find(p => p.type === 'regen')!;
            expect(Math.round(regen.value * 100)).toBeGreaterThanOrEqual(1);

            let total = 0;
            for (let stack = 0; stack < (regen.maxStacks ?? POWERUP_STACK_CAP); stack++) {
                total += getPowerupValue(regen.value, stack, regen.stackGrowth);
            }

            const secondsQuarterToThreeQuarters = Math.log(3) / total;
            expect(secondsQuarterToThreeQuarters).toBeGreaterThan(25);
            expect(secondsQuarterToThreeQuarters).toBeLessThan(90);
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

        it('says so when a percentage is a chance rather than a size', () => {
            i18n.setLang('en');
            // Kill Echo's card number is the odds of it firing; the blast
            // itself is half the target's current health. A bare "+10%" next
            // to a pool where every other bare percentage IS a size read as
            // the damage, which is the one thing it is not.
            expect(formatPowerupBonus('killEcho', 0.1)).toBe('+10% chance');
            expect(formatPowerupBonus('siphon', 0.025)).toBe('+3% chance');
            // A size stays bare
            expect(formatPowerupBonus('firstStrike', 0.12)).toBe('+12%');
        });

        it('calls a Static Discharge stack a tier, because that is what it buys', () => {
            i18n.setLang('en');
            expect(formatPowerupBonus('discharge', 1)).toBe('+1 tier');
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
        expect(formatStatValue('armor', 0.3)).toBe('0.3');
    });

    it('shows regen as a percentage — it is a share of missing HP, not HP/s', () => {
        expect(formatStatValue('regen', 0.03)).toBe('3%');
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

    /**
     * Total XP needed to reach a level, by replaying the real curve.
     */
    function xpToReach(target: number): number {
        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        let total = 0;
        while (player.level < target) {
            total += player.nextLevelXp;
            player.levelUp();
        }
        return total;
    }

    /** Highest level a run generating `xp` total would reach */
    function levelFor(xp: number): number {
        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        let spent = 0;
        while (spent + player.nextLevelXp <= xp) {
            spent += player.nextLevelXp;
            player.levelUp();
        }
        return player.level;
    }

    it('does not touch the early and middle game', () => {
        // The opening minutes were tuned and are not the complaint. The
        // transition is where the compounding curve had already outrun income,
        // so everything below it must be byte-for-byte what it was.
        expect(xpToReach(10)).toBe(315);
        expect(xpToReach(20)).toBe(2031);
        expect(xpToReach(Player.XP_LINEAR_FROM)).toBe(22139);
    });

    it('joins the linear tail without a step in cost', () => {
        // The flat step IS the increment the compounding curve had at the
        // transition, so the curve stops accelerating rather than kinking. A
        // visible jump here would read to the player as "the game got harder
        // at level 40".
        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        while (player.level < Player.XP_LINEAR_FROM) player.levelUp();

        const atTransition = player.nextLevelXp;
        const compounding = Math.floor(atTransition * 1.1 + 6);
        player.levelUp();
        expect(Math.abs(player.nextLevelXp - compounding)).toBeLessThanOrEqual(2);
    });

    it('late levels stay expensive, but stop doubling away from income', () => {
        // XP income cannot compound — it is bounded by the 400-enemy
        // population cap and by how fast a build deletes them. Measured on a
        // real 15-minute Void Nexus clear: ~32.7 XP a kill at 11.8 kills/s,
        // so roughly 386 XP/s at the end of the longest run in the game.
        const INCOME = 386;
        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        while (player.level < 76) player.levelUp();

        const seconds = player.nextLevelXp / INCOME;
        // The old curve charged 93 seconds here and 10% more every level after
        expect(seconds).toBeGreaterThan(20); // still earned, not handed over
        expect(seconds).toBeLessThan(60);
    });

    it('a whole run cannot drain the upgrade pool', () => {
        // The flat step's own failure, measured: a denser arena pushed a
        // 15-minute clear to 816,346 XP and level 111 — and there are only 120
        // picks in the entire game (30 weapon levels + 90 perk stacks). The run
        // had taken 110 of them. Whatever the curve does, the end of a run must
        // still be a build rather than a full set.
        // Counted, not hardcoded: adding perks must not quietly buy the curve
        // room it did not earn.
        const totalPicks = 6 * WEAPON_SLOT_CAP
            + POWERUPS.reduce((n, p) => n + (p.maxStacks ?? POWERUP_STACK_CAP), 0);
        expect(levelFor(816346)).toBeLessThan(totalPicks * 0.85);
    });

    it('turns a won Void Nexus run into more picks, and a lost one into none', () => {
        // Two measured runs. The winning one spent its last levels with every
        // weapon already at 6, so every level the curve gives back is a perk.
        // 76 picks out of 120: enough that the late game keeps handing out
        // decisions, not so many that it hands out everything.
        expect(xpToReach(76)).toBeLessThanOrEqual(355140);
        expect(xpToReach(77)).toBeGreaterThan(355140);

        // The nine-minute defeat is untouched: same XP, same level. The tail
        // starts at 40 and a run that ends there never reaches it.
        expect(xpToReach(49)).toBeLessThanOrEqual(55487);
        expect(xpToReach(50)).toBeGreaterThan(55487);
    });
});

describe('Player stat defaults', () => {
    it('the reference copy matches what a player actually starts with', () => {
        // `isStatModified` decides what the run summary prints, so a stat that
        // drifts from this table silently starts reporting itself as "moved"
        // in every run — or stops reporting at all.
        const player = new Player(0, 0);
        expect(Object.keys(player.stats).sort())
            .toEqual(Object.keys(DEFAULT_PLAYER_STATS).sort());
        for (const [key, value] of Object.entries(player.stats)) {
            expect(DEFAULT_PLAYER_STATS[key], key).toBe(value);
        }
    });

    it('hides stats nothing in the game can move', () => {
        // Overclock and Vampiric Link are both gone, so `speed` and `growth`
        // are seams with no source. They must not sit in the summary looking
        // like something the build chose.
        expect(POWERUPS.some(p => p.type === 'speed')).toBe(false);
        expect(POWERUPS.some(p => p.type === 'growth')).toBe(false);
        expect(isStatModified('speed', 1)).toBe(false);
        expect(isStatModified('growth', 1)).toBe(false);
        expect(isStatModified('might', 1.34)).toBe(true);
        expect(isStatModified('armor', -2)).toBe(true);
    });
});

describe('Magnet range', () => {
    it('grows on its own, so pickup range is never a card you must buy', () => {
        // Gravity Well was the clearest junk pick in the pool: crystals never
        // despawn, so range buys convenience and competed at the same draft
        // weight as damage. A real run spent 3 of its 19 perk picks on it.
        expect(POWERUPS.some(p => p.type === 'magnet')).toBe(false);

        const player = new Player(0, 0);
        player.onLevelUp = () => { };
        const base = player.stats.magnet;
        while (player.level < 50) player.levelUp();

        // Nearly four of the old picks' worth by level 50, and free
        expect(player.stats.magnet - base).toBe(98);
        // Not so far that crystals fly in from off screen
        expect(player.stats.magnet).toBeLessThan(300);
    });
});

describe('Draft weighting', () => {
    it('stops flooding the draw with weapon cards once they are levelled', () => {
        // Two measured runs: 29 of 48 picks into weapons ended in defeat at
        // 9:00, 27 of 67 into weapons (40 into perks) cleared 15:24. Weapons
        // add and perks multiply, so the draft must not steer into weapons
        // through the middle of a run.
        const rng = mulberry32(11);
        const owned = WEAPONS.slice(0, WEAPON_SLOT_CAP);
        const weaponLevels = new Map(owned.map(w => [w.id, 4] as [string, number]));

        let weaponCards = 0;
        const DRAWS = 400;
        for (let i = 0; i < DRAWS; i++) {
            const options = buildUpgradeOptions({
                weaponLevels,
                powerupLevels: new Map(),
                count: 3,
                classId: 'berserker',
                rng,
            });
            weaponCards += options.filter(o => o.type === 'weapon').length;
        }
        // Measured on this exact fixture: 50.75% of all cards were weapon
        // cards under the flat weight of 9, against 45.0% now. Perks are the
        // majority of the draw through the stretch where they are the better
        // pick, which they were not before.
        const share = weaponCards / (DRAWS * 3);
        expect(share).toBeLessThan(0.48);
    });

    it('still feeds a fresh weapon and still pays off an evolution', () => {
        // The weight drop must not reach either end: a level-1 weapon is
        // genuinely weak, and starving level 5 is how the pool once needed
        // ~60 levels to evolve anything.
        const rng = mulberry32(3);
        const fresh = WEAPONS[0];
        const ready = WEAPONS[1];

        let freshSeen = 0;
        let readySeen = 0;
        const DRAWS = 400;
        for (let i = 0; i < DRAWS; i++) {
            const options = buildUpgradeOptions({
                weaponLevels: new Map([[fresh.id, 1], [ready.id, 5]]),
                powerupLevels: new Map(),
                count: 3,
                classId: 'berserker',
                rng,
            });
            if (options.some(o => o.data.id === fresh.id)) freshSeen++;
            if (options.some(o => o.data.id === ready.id)) readySeen++;
        }
        expect(freshSeen / DRAWS).toBeGreaterThan(0.15);
        expect(readySeen / DRAWS).toBeGreaterThan(freshSeen / DRAWS);
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

    it('pays crit chance out as crit damage once it is capped', () => {
        // Yasuo's rule: overflow crit chance becomes damage rather than nothing
        const below = effectivePowerup('critChance', 0.05, { critChance: 0.5 });
        expect(below.type).toBe('critChance');
        expect(below.value).toBe(0.05);

        const capped = effectivePowerup('critChance', 0.05, { critChance: 1 });
        expect(capped.type).toBe('critDamage');
        expect(capped.value).toBeGreaterThan(0);
    });

    it('converts on the way in, so a capped pick is never wasted', () => {
        const stats: Record<string, number> = { critChance: 0.98, critDamage: 2 };
        addStat(stats, 'critChance', 0.05);
        expect(stats.critChance).toBe(1);
        // 0.03 of the pick overflowed and landed on crit damage instead
        expect(stats.critDamage).toBeGreaterThan(2);
    });
});
