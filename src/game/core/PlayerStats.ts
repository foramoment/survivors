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
    'maxHp',

    // Tactics
    'discharge',
    'killEcho',
    'adrenaline',
    'siphon',
    'reroll',
] as const;

export type PlayerStatType = typeof VALID_PLAYER_STATS[number];
