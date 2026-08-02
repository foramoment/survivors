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
 * - Powerups stack FLAT up to their own `maxStacks`, and stop being offered
 *   once maxed. See the PowerupData comment in data/GameData for why the old
 *   shared 25%-per-stack curve had to go.
 * - Every draw is guaranteed to contain at least one owned-weapon upgrade
 *   when one exists.
 */

import { POWERUPS, WEAPONS } from '../data/GameData';
import { t } from './I18n';

export const WEAPON_SLOT_CAP = 5;
/** Fallback cap for a powerup that forgot to declare `maxStacks` */
export const POWERUP_STACK_CAP = 8;
/** Repeat picks are worth exactly the base value unless a powerup opts out */
export const POWERUP_FLAT_GROWTH = 1;

const WEIGHT_OWNED_WEAPON = 9;
const WEIGHT_EVOLVE_READY = 14;
const WEIGHT_NEW_WEAPON = 2;
const WEIGHT_POWERUP = 3;

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
    rng?: () => number;
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
const FLAT_TYPES = ['magnet', 'maxHp', 'armor', 'regen', 'discharge', 'reroll'];

/** Human-readable bonus string, e.g. "+8%" or "+15 Max HP" */
export function formatPowerupBonus(type: string, value: number): string {
    const sign = value >= 0 ? '+' : '−';
    const abs = Math.abs(value);
    if (FLAT_TYPES.includes(type)) {
        const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
        return `${sign}${rounded} ${t(`bonus.${type}`)}`;
    }
    return `${sign}${Math.round(abs * 100)}%`;
}

/**
 * Stat types shown as a percentage of a baseline of 1 rather than a raw number.
 * `might: 1.24` means nothing on a card; "124%" does.
 */
const PERCENT_TYPES = [
    'might', 'area', 'cooldown', 'speed', 'duration', 'moveSpeed', 'growth',
    'critChance', 'critDamage', 'killEcho', 'adrenaline', 'siphon',
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
                weight: level === 5 ? WEIGHT_EVOLVE_READY : WEIGHT_OWNED_WEAPON,
            });
        } else if (ownedWeaponCount < WEAPON_SLOT_CAP) {
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
