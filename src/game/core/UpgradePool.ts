/**
 * UpgradePool — weighted level-up offer generation.
 *
 * Fixes the core progression problem: with a uniform pool of ~30 options a
 * specific owned weapon appeared in a 3-card draw only ~10% of the time, so
 * evolving a weapon (5 repeat picks) needed ~60 levels — impossible in a run.
 *
 * Rules:
 * - Owned weapons are weighted far above everything else; an evolve-ready
 *   weapon (level 5) even higher, so the payoff is reachable.
 * - The player can hold at most WEAPON_SLOT_CAP distinct weapons; once full,
 *   new weapons stop appearing and picks focus on what they have.
 * - Each class's starting weapon is exclusive to it (see SIGNATURE_WEAPONS),
 *   so the shared pool of new weapons is eight, not fourteen.
 * - Powerups stack FLAT up to their own `maxStacks`, and stop being offered
 *   once maxed. See the PowerupData comment in data/GameData for why the old
 *   shared 25%-per-stack curve had to go.
 * - Every draw is guaranteed to contain at least one owned-weapon upgrade
 *   when one exists.
 */

import { CLASSES, POWERUPS, WEAPONS } from '../data/GameData';
import { CRIT_OVERFLOW_TO_DAMAGE } from './PlayerStats';
import { t } from './I18n';

/**
 * weaponId -> the class it belongs to.
 *
 * A class's starting weapon is its **signature**: nobody else can be offered
 * it. Six of the fourteen weapons are spoken for this way, and the remaining
 * eight are the shared pool everyone draws from.
 *
 * The point is that "which character" stops meaning "which weapon do I open
 * with" and starts meaning "which weapon can I only have here". A Storm Mage
 * run is the only run with Lightning Chain in it; if you want the swept Void
 * Ray you play the Void Walker. It also gives the class perks something fixed
 * to be designed around, since the pairing can no longer be diluted by drawing
 * the same weapon on somebody else.
 */
export const SIGNATURE_WEAPONS: ReadonlyMap<string, string> = new Map(
    CLASSES.map(c => [c.weaponId, c.id])
);

/** Can this class be offered this weapon as a NEW pick? */
export function canOfferWeapon(weaponId: string, classId: string | undefined): boolean {
    const owner = SIGNATURE_WEAPONS.get(weaponId);
    return owner === undefined || owner === classId;
}

export const WEAPON_SLOT_CAP = 5;
/** Fallback cap for a powerup that forgot to declare `maxStacks` */
export const POWERUP_STACK_CAP = 8;
/** Repeat picks are worth exactly the base value unless a powerup opts out */
export const POWERUP_FLAT_GROWTH = 1;

/**
 * Draft weight of a weapon you already own, by how far along it is.
 *
 * The shape exists because of a measured problem. Two real runs, same player:
 *
 *     29 of 48 picks into weapons, 19 into perks  ->  48k DPS, died at 9:00
 *     27 of 67 picks into weapons, 40 into perks  ->  284k DPS, cleared 15:24
 *
 * Weapons **add** (a fifth weapon is a fifth source) and perks **multiply** (a
 * maxed Cooling System is +67% to all of them at once), so the marginal perk
 * beats the marginal weapon level from somewhere in the middle of a run
 * onward. The flat weight of 9 meant a five-weapon player saw weapons on
 * roughly half of all cards — the draft was steering toward the worse pick and
 * the losing run was the one that followed it.
 *
 * So the weight now falls where the weapon is already carrying its weight, and
 * nowhere else:
 *
 * - **Levels 1–2** keep the old 9. A freshly taken weapon is genuinely weak,
 *   and starving it is how the pool used to need ~60 levels to evolve anything.
 * - **Levels 3–4** drop to 6. This is the stretch that was crowding out the
 *   whole powerup pool, and it is exactly where a weapon needs the draft least.
 * - **Level 5** spikes to 14, unchanged. The evolution payoff has to stay
 *   reachable; that was never the part that was broken.
 */
const WEIGHT_OWNED_WEAPON = 9;
const WEIGHT_OWNED_WEAPON_MID = 6;
const WEIGHT_EVOLVE_READY = 14;
const WEIGHT_NEW_WEAPON = 2;
const WEIGHT_POWERUP = 3;

/** Draft weight for an owned weapon at this level (1..5) */
function ownedWeaponWeight(level: number): number {
    if (level >= 5) return WEIGHT_EVOLVE_READY;
    if (level >= 3) return WEIGHT_OWNED_WEAPON_MID;
    return WEIGHT_OWNED_WEAPON;
}

export interface UpgradeOption {
    type: 'weapon' | 'powerup';
    data: any;
    /** For powerups: how many stacks the player already has */
    stack?: number;
}

export interface OfferContext {
    /** weaponId -> level (1..6) for owned weapons */
    weaponLevels: Map<string, number>;
    /** powerup name -> times taken */
    powerupLevels: Map<string, number>;
    count: number;
    /** Who is playing — decides which signature weapons may be offered */
    classId?: string;
    /** The player's live stats. Optional; unused by the draw today. */
    stats?: Record<string, number>;
    rng?: () => number;
}

/**
 * What a powerup is actually worth to *this* player right now.
 *
 * Only crit chance differs from its own card today: past 100% it converts into
 * crit damage (see CRIT_OVERFLOW_TO_DAMAGE), so a capped Berserker offered
 * Targeting HUD should be told "crit damage 340% → 352%", not the "99% → 104%"
 * that started this. The card is otherwise unchanged.
 */
export function effectivePowerup(
    type: string,
    value: number,
    stats?: Record<string, number>,
): { type: string; value: number } {
    if (type === 'critChance' && stats && (stats.critChance ?? 0) >= 1) {
        return { type: 'critDamage', value: value * CRIT_OVERFLOW_TO_DAMAGE };
    }
    return { type, value };
}

/**
 * Effective bonus of a powerup at a given stack (0 = first pick).
 *
 * Flat by default: every pick is worth exactly the base value. A powerup may
 * opt into a compounding curve with `stackGrowth` in GameData, but nothing does
 * today — a shared curve is how "+18% duration" quietly became +357%.
 */
export function getPowerupValue(
    baseValue: number,
    stack: number,
    growth: number = POWERUP_FLAT_GROWTH
): number {
    return baseValue * Math.pow(growth, stack);
}

/** Stat types shown as a flat amount with a unit instead of a percentage */
const FLAT_TYPES = ['magnet', 'maxHp', 'armor', 'discharge', 'reroll', 'shield'];

/**
 * Percentages that are a **probability of the effect firing**, not a size.
 *
 * These have to say so. A bare "+10%" on Kill Echo is the one number on the
 * card that is not what the perk is about — the blast itself is half the
 * target's current health — and the player read it as the damage. Every other
 * bare percentage in the pool (might, area, crit damage…) *is* a size, so the
 * unadorned form quietly promises the wrong kind of thing here.
 */
const CHANCE_TYPES = ['killEcho', 'siphon'];

/** Is this stat a probability of something firing rather than a size? */
export function isChanceStat(type: string): boolean {
    return CHANCE_TYPES.includes(type);
}

/** Human-readable bonus string, e.g. "+8%", "+15 Max HP" or "+10% chance" */
export function formatPowerupBonus(type: string, value: number): string {
    const sign = value >= 0 ? '+' : '−';
    const abs = Math.abs(value);
    if (FLAT_TYPES.includes(type)) {
        const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
        return `${sign}${rounded} ${t(`bonus.${type}`)}`;
    }
    if (CHANCE_TYPES.includes(type)) {
        return `${sign}${Math.round(abs * 100)}% ${t('bonus.chance')}`;
    }
    return `${sign}${Math.round(abs * 100)}%`;
}

/**
 * Stat types shown as a percentage of a baseline of 1 rather than a raw number.
 * `might: 1.24` means nothing on a card; "124%" does.
 */
const PERCENT_TYPES = [
    'might', 'area', 'cooldown', 'speed', 'duration', 'moveSpeed', 'growth',
    'critChance', 'critDamage', 'killEcho', 'siphon', 'firstStrike',
    // A fraction of missing HP per second — "1%" says what it does, "0.01" does not
    'regen',
];

/** Render one stat value the way a card should show it */
export function formatStatValue(type: string, value: number): string {
    if (PERCENT_TYPES.includes(type)) return `${Math.round(value * 100)}%`;
    const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
    return String(rounded);
}

/**
 * "124% → 132%". The bonus line alone ("+8%") never said 8% of *what*, or what
 * you already had — which is the number that decides whether the pick is worth
 * taking over the other two cards.
 */
export function formatStatPreview(type: string, current: number, next: number): string {
    return `${formatStatValue(type, current)} → ${formatStatValue(type, next)}`;
}

interface WeightedEntry {
    option: UpgradeOption;
    weight: number;
}

function buildEntries(ctx: OfferContext): WeightedEntry[] {
    const entries: WeightedEntry[] = [];
    const ownedWeaponCount = ctx.weaponLevels.size;

    for (const weapon of WEAPONS) {
        const level = ctx.weaponLevels.get(weapon.id) ?? 0;
        if (level >= 6) continue; // fully evolved
        if (level > 0) {
            entries.push({
                option: { type: 'weapon', data: weapon },
                weight: ownedWeaponWeight(level),
            });
        } else if (ownedWeaponCount < WEAPON_SLOT_CAP && canOfferWeapon(weapon.id, ctx.classId)) {
            // Another class's signature weapon is never offered — see
            // SIGNATURE_WEAPONS. Owned weapons above are exempt: your own
            // signature must still show up to be levelled.
            entries.push({ option: { type: 'weapon', data: weapon }, weight: WEIGHT_NEW_WEAPON });
        }
    }

    for (const powerup of POWERUPS) {
        const stack = ctx.powerupLevels.get(powerup.name) ?? 0;
        if (stack >= (powerup.maxStacks ?? POWERUP_STACK_CAP)) continue;
        entries.push({ option: { type: 'powerup', data: powerup, stack }, weight: WEIGHT_POWERUP });
    }

    return entries;
}

/** Weighted sampling without replacement */
function sample(entries: WeightedEntry[], count: number, rng: () => number): UpgradeOption[] {
    const pool = [...entries];
    const picked: UpgradeOption[] = [];

    while (picked.length < count && pool.length > 0) {
        const total = pool.reduce((sum, e) => sum + e.weight, 0);
        let roll = rng() * total;
        let index = 0;
        for (let i = 0; i < pool.length; i++) {
            roll -= pool[i].weight;
            if (roll <= 0) { index = i; break; }
        }
        picked.push(pool[index].option);
        pool.splice(index, 1);
    }

    return picked;
}

export function buildUpgradeOptions(ctx: OfferContext): UpgradeOption[] {
    const rng = ctx.rng ?? Math.random;
    const entries = buildEntries(ctx);
    const picked = sample(entries, ctx.count, rng);

    // Guarantee: at least one owned-weapon upgrade in every draw (when one exists)
    const hasOwnedWeapon = picked.some(
        o => o.type === 'weapon' && (ctx.weaponLevels.get(o.data.id) ?? 0) > 0
    );
    if (!hasOwnedWeapon) {
        const ownedEntries = entries.filter(
            e => e.option.type === 'weapon' && (ctx.weaponLevels.get(e.option.data.id) ?? 0) > 0
        );
        if (ownedEntries.length > 0 && picked.length > 0) {
            const replacement = sample(ownedEntries, 1, rng)[0];
            picked[picked.length - 1] = replacement;
        }
    }

    return picked;
}
