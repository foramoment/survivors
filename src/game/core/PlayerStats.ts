/**
 * Централизованный список всех валидных стат игрока.
 * Используется для валидации powerups и классов в тестах.
 *
 * Последние четыре — не множители, а «тактики»: они включают поведение
 * (см. core/Tactics.ts), а не двигают цифру. Powerup с таким типом всё равно
 * складывается через общий `applyPowerup`, просто читает его другая система.
 */
export const VALID_PLAYER_STATS = [
    'might',
    'area',
    'cooldown',
    'speed',
    'duration',
    'moveSpeed',
    'magnet',
    'growth',
    'armor',
    'regen',
    'critChance',
    'critDamage',
    'firstStrike',
    'maxHp',

    // Tactics
    'discharge',
    'killEcho',
    'siphon',
    'reroll',
] as const;

export type PlayerStatType = typeof VALID_PLAYER_STATS[number];

/**
 * Hard limits that no amount of stacking may cross, applied after every
 * powerup pick and every class level-up.
 *
 * `critChance` is a probability, not a multiplier: past 1.0 the extra does
 * nothing at all, but the level-up card still cheerfully offered "99% → 104%".
 * A Berserker reaches 100% on class growth alone (+1% per level) somewhere
 * around level 35, so this is not an edge case — it is what a long run looks
 * like.
 *
 * `cooldown` has a floor because zone tick intervals are multiplied by it, and
 * zero would mean every zone ticks every frame.
 */
export const STAT_LIMITS: Record<string, { min?: number; max?: number }> = {
    critChance: { min: 0, max: 1 },
    cooldown: { min: 0.25 },
};

/** Clamp every limited stat in place. Safe to call on any stats object. */
export function clampStats(stats: Record<string, number>): void {
    for (const key in STAT_LIMITS) {
        if (!(key in stats)) continue;
        const { min, max } = STAT_LIMITS[key];
        if (min !== undefined && stats[key] < min) stats[key] = min;
        if (max !== undefined && stats[key] > max) stats[key] = max;
    }
}

/**
 * Crit chance past 100% is converted into crit damage at this rate.
 *
 * Lifted straight from Yasuo and Yone in League, where crit chance over the cap
 * becomes bonus attack damage. It solves the same problem this game has: a
 * Berserker gains +1% crit per level and is at certainty around level 35, after
 * which every Targeting HUD pick — and every remaining level of the class's own
 * growth — is worth literally nothing.
 *
 * 2.5 means one Targeting HUD pick (+5% chance) becomes +12.5% crit damage once
 * capped: about half a Berserker Rage pick. Deliberately *worse* than the perk
 * built for the job, so the conversion is a floor under a wasted pick rather
 * than a reason to keep buying the wrong card.
 */
export const CRIT_OVERFLOW_TO_DAMAGE = 2.5;

/**
 * Add to a stat, honouring both the hard limits and the overflow conversions.
 *
 * Every path that raises a player stat goes through here — powerup picks and
 * per-level class growth alike — so the two cannot drift apart. They already
 * had: the powerup path clamped cooldown and the class path clamped it
 * separately, with the crit ceiling handled in neither.
 */
export function addStat(stats: Record<string, number>, type: string, value: number): void {
    if (type === 'critChance') {
        const room = Math.max(0, 1 - (stats.critChance ?? 0));
        const applied = Math.min(value, room);
        const overflow = value - applied;
        stats.critChance = (stats.critChance ?? 0) + applied;
        if (overflow > 0) {
            stats.critDamage = (stats.critDamage ?? 0) + overflow * CRIT_OVERFLOW_TO_DAMAGE;
        }
        return;
    }

    stats[type] = (stats[type] ?? 0) + value;
    clampStats(stats);
}
