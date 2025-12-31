/**
 * Централизованный список всех валидных стат игрока.
 * Используется для валидации powerups и классов в тестах.
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
    'tick',
    'maxHp'
] as const;

export type PlayerStatType = typeof VALID_PLAYER_STATS[number];


