/**
 * Stage (level) configuration.
 *
 * Each stage defines its own enemy pool (indices into ENEMIES ordered by wave
 * progression), a procedural background theme, stat multipliers and a duration.
 * Surviving until `duration` spawns the final boss; killing it wins the stage.
 */

export interface StageConfig {
    id: string;
    name: string;
    emoji: string;
    description: string;
    /** Seed string for the procedural background tile */
    theme: string;
    /** Indices into ENEMIES, in wave order (wave N spawns pool[N] → pool[N+1]) */
    enemyPool: number[];
    /** Seconds to survive before the final boss appears */
    duration: number;
    /** Stage-wide enemy HP multiplier */
    hpScale: number;
    /** Stage-wide enemy damage multiplier */
    damageScale: number;
}

export const STAGES: StageConfig[] = [
    {
        id: 'asteroid_fields',
        name: 'Asteroid Fields',
        emoji: '🪨',
        description: 'Rocky wastes on the edge of known space. A good place to start.',
        theme: 'Asteroid Fields',
        enemyPool: [0, 1, 2, 3, 4, 5, 6],
        duration: 600, // 10 minutes
        hpScale: 1,
        damageScale: 1,
    },
    {
        id: 'derelict_station',
        name: 'Derelict Station',
        emoji: '🛰️',
        description: 'An abandoned orbital station overrun by machines and worse.',
        theme: 'Derelict Station',
        enemyPool: [1, 3, 4, 6, 7, 8, 9],
        duration: 720, // 12 minutes
        hpScale: 1.4,
        damageScale: 1.25,
    },
    {
        id: 'void_nexus',
        name: 'Void Nexus',
        emoji: '🌀',
        description: 'The heart of the invasion. Everything here wants you dead.',
        theme: 'Void Nexus',
        enemyPool: [3, 5, 6, 7, 8, 9, 10],
        duration: 900, // 15 minutes
        hpScale: 1.9,
        damageScale: 1.5,
    },
];
