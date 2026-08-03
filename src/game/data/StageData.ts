import { audio, type MusicProfile } from '../../engine/AudioSystem';
/**
 * Stage (level) configuration.
 *
 * Each stage defines its own enemy pool (indices into ENEMIES ordered by wave
 * progression), a procedural background theme, stat multipliers and a duration.
 * Surviving until `duration` spawns the final boss; killing it wins the stage.
 */

/**
 * Look of a stage: the parallax layers behind the floor and the coloured
 * lighting on top of it. Purely cosmetic — consumed by `core/StageBackdrop`.
 */
export interface StageVisuals {
    /** Void colour behind every parallax layer */
    space: string;
    /** Two haze colours (rgba) baked into the far nebula tile */
    nebula: [string, string];
    /** Twinkling star colour on the far layer */
    star: string;
    /** Near-layer dust / debris colour */
    dust: string;
    /** Hue (0–360) of the procedural floor tile */
    floorHue: number;
    /** Screen-space colour wash over the whole arena */
    light: string;
    lightAlpha: number;
    /** Vignette colour at the screen edges */
    edge: string;
    edgeAlpha: number;
    /** 0 = steady lighting, 1 = full broken-lamp strobe + side beacons */
    flicker: number;
    /** Slow breathing pulse of the wash (0 = none) */
    pulse: number;
}

/** Shape family of a stage's obstacles */
export type PropStyle = 'rock' | 'crate' | 'crystal';

/** Timed arena hazard the stage runs every 30–60s (see `core/ArenaEvents`) */
export type ArenaEventKind = 'meteors' | 'blackout' | 'rifts';

/** Obstacles scattered across the arena — these block movement */
export interface StageProps {
    style: PropStyle;
    /** Average obstacles per 520×520 world chunk (0 = none) */
    density: number;
    /** Collision radius range in world pixels */
    minRadius: number;
    maxRadius: number;
}

export interface StageConfig {
    id: string;
    name: string;
    emoji: string;
    description: string;
    /** Seed string for the procedural background tile */
    theme: string;
    /** Parallax + lighting palette */
    visuals: StageVisuals;
    /** Obstacle field */
    props: StageProps;
    /** Recurring arena hazard */
    event: ArenaEventKind;
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
        // Rusty orange: dust storms lit by a distant red dwarf
        visuals: {
            space: '#0a0605',
            nebula: ['rgba(168, 74, 20, 0.34)', 'rgba(96, 34, 82, 0.20)'],
            star: '#ffd9a0',
            dust: '#c99a5e',
            floorHue: 24,
            light: '#ff7a2a',
            lightAlpha: 0.06,
            edge: '#2a1004',
            edgeAlpha: 0.70,
            flicker: 0,
            pulse: 0.18,
        },
        props: { style: 'rock', density: 1.1, minRadius: 26, maxRadius: 52 },
        event: 'meteors',
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
        // Cold cyan hull lighting with failing emergency lamps
        visuals: {
            space: '#04080c',
            nebula: ['rgba(20, 96, 138, 0.30)', 'rgba(12, 44, 92, 0.24)'],
            star: '#c9f4ff',
            dust: '#8fd0e8',
            floorHue: 196,
            light: '#3fd8ff',
            lightAlpha: 0.055,
            edge: '#02141c',
            edgeAlpha: 0.72,
            flicker: 0.9,
            pulse: 0,
        },
        props: { style: 'crate', density: 1.4, minRadius: 24, maxRadius: 44 },
        event: 'blackout',
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
        // Violet rift light that breathes with the nexus itself
        visuals: {
            space: '#07030f',
            nebula: ['rgba(122, 30, 194, 0.34)', 'rgba(214, 28, 122, 0.22)'],
            star: '#e6c9ff',
            dust: '#b98cff',
            floorHue: 278,
            light: '#a44bff',
            lightAlpha: 0.075,
            edge: '#170428',
            edgeAlpha: 0.75,
            flicker: 0.2,
            pulse: 0.55,
        },
        props: { style: 'crystal', density: 0.9, minRadius: 22, maxRadius: 40 },
        event: 'rifts',
        enemyPool: [3, 5, 6, 7, 8, 9, 10],
        duration: 900, // 15 minutes
        hpScale: 1.9,
        damageScale: 1.5,
    },
];

/**
 * How each arena SOUNDS.
 *
 * These live here, next to the stage they belong to, and are handed to the
 * engine at boot (see registerStageMusic). `engine/AudioSystem` ships no
 * profiles of its own — "Derelict Station is industrial" is a fact about this
 * game, and the engine is not allowed to know any of those.
 *
 * Each stage gets three tracks. They are siblings, not strangers: same mode,
 * same tempo band, same room, transposed to related keys, drawing hooks and
 * progressions from the same pool. The point is variety across a session
 * without the arena changing character halfway through a run.
 *
 * The mode does most of the work. Aeolian is the minor everyone hears as
 * heroic-sad; dorian's raised sixth takes the sorrow out and leaves something
 * wary and mechanical; phrygian's flattened second is one semitone away from
 * aeolian and turns "sad" into "wrong".
 */
export const STAGE_MUSIC: Record<string, MusicProfile> = {
    // Open space, forward motion, a fight you can win. Bright and driving, with
    // enough echo to sound like somewhere with no walls.
    'Asteroid Fields': {
        mode: 'aeolian',
        bpm: [126, 138],
        root: 45,               // A2
        progressions: [0, 1],   // heroic, driving
        leadDuties: [0.25, 0.5],
        delay: [0.34, 0.23],
        drive: 5,
        brightness: 9500,
    },

    // Corridors, failing power, something moving one room over. Slower and
    // dirtier: heavy drive for the grind of machinery, a SHORT slapback because
    // a small metal room has no long tail, and a hard lowpass ceiling so it
    // never opens up the way the asteroid belt does.
    'Derelict Station': {
        mode: 'dorian',
        bpm: [108, 120],
        root: 43,               // G2 — lower, heavier
        progressions: [2, 3],   // descending, wistful
        leadDuties: [0.125, 0.25],
        delay: [0.22, 0.11],
        drive: 11,
        brightness: 5200,
    },

    // Not a place. Fast, cold and thin, with a long echo that never quite
    // resolves — phrygian throughout, so even the calm sections sit a semitone
    // away from comfortable.
    'Void Nexus': {
        mode: 'phrygian',
        bpm: [138, 152],
        root: 47,               // B2 — thinner, more strung-out
        progressions: [2, 3],
        leadDuties: [0.125],
        delay: [0.42, 0.33],
        drive: 4,
        brightness: 11000,
    },
};

/** Hand the arena music profiles to the engine. Called once, at boot. */
export function registerStageMusic() {
    for (const [theme, profile] of Object.entries(STAGE_MUSIC)) {
        audio.registerMusicProfile(theme, profile);
    }
}
