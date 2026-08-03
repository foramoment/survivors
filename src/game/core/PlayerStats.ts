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
    'adrenaline',
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
