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

/**
 * Начальные значения стат игрока.
 * Используется для типизации и создания нового игрока.
 */
export const DEFAULT_PLAYER_STATS: Record<PlayerStatType, number> = {
    might: 1,
    area: 1,
    cooldown: 1,
    speed: 1,
    duration: 1,
    moveSpeed: 1,
    magnet: 100,
    growth: 1,
    armor: 0,
    regen: 0,
    critChance: 0.05,
    critDamage: 1.5,
    tick: 0,
    maxHp: 0  // maxHp обрабатывается отдельно
};
