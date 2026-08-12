/**
 * DifficultyDirector — adaptive difficulty controller.
 *
 * Replaces the old per-frame `Math.random() < 0.05 + gameTime/1000` spawn check
 * (which was framerate-dependent) with an accumulator-based spawn budget, and
 * adds an adaptive `intensity` multiplier that reacts to how well the player
 * is actually doing instead of scaling by time alone.
 *
 * Signals used for adaptation (evaluated once per second):
 * - player HP ratio — a player at full HP is not being threatened
 * - clear ratio — recent kills/sec vs current spawns/sec; >1 means the player
 *   kills faster than we spawn
 *
 * The director also emits discrete events at wave boundaries (every 60s):
 * - `burst`  — a ring of extra enemies spawned at once
 * - `miniboss` — a single boss-grade enemy of the upcoming wave's type
 *
 * and, on its own 30–60s cadence, `arena` — the stage's hazard (meteors,
 * blackout, rifts). It lives here rather than in a second scheduler so all
 * timed pressure comes from one place.
 */

export interface DifficultyContext {
    gameTime: number;
    playerLevel: number;
    /** player.hp / player.maxHp, 0..1 */
    playerHpRatio: number;
    enemyCount: number;
    /** total kills this run (director diffs it internally) */
    killCount: number;
}

export type DifficultyEvent =
    | { type: 'burst'; count: number; waveIndex: number }
    | { type: 'miniboss'; waveIndex: number }
    | { type: 'arena' };

/**
 * What one player level is worth on the difficulty clock, in seconds.
 *
 * Calibrated against the XP curve (`Player.levelUp`): normal play lands around
 * six levels a minute early on, i.e. roughly ten seconds a level. This is
 * deliberately **below** that, so an ordinary run is always governed by the
 * clock and the level term only takes over for a player who is genuinely
 * running ahead of it — at eight, you have to be about 25% over the expected
 * level before the arena starts answering.
 */
const LEVEL_AS_SECONDS = 8;

/** Cadence of the stage hazard, in seconds */
export const ArenaSchedule = {
    /** First hazard lands well after the opening minute is under control */
    FIRST: 45,
    MIN: 30,
    MAX: 60,
} as const;

export class DifficultyDirector {
    static readonly WAVE_DURATION = 60;
    static readonly MIN_INTENSITY = 0.6;
    static readonly MAX_INTENSITY = 3.0;
    /**
     * Population ceiling. Raised 400 -> 600 to see what a denser arena plays
     * like.
     *
     * This is not a neutral knob. Two things ride on it, and both should be
     * watched on the next playtest:
     *
     *  - **It is the ceiling on XP income**, which is the whole reason the
     *    level curve had to stop compounding (see `Player.XP_LINEAR_FROM`).
     *    Raising it raises how fast a strong build levels.
     *  - **It is worth far more to area weapons than to single-target ones.**
     *    A zone hits everything standing in it, so its output scales with
     *    density; a projectile does not. A measured all-AoE clear took 243
     *    damage across 47 seconds of contact, against 1374 across 2:58 for a
     *    mixed build on the same stage — density is already the axis that
     *    separates them, and this widens it.
     */
    static readonly MAX_ENEMIES = 600;

    /** Adaptive pressure multiplier (1 = baseline) */
    intensity: number = 1;

    private spawnAccumulator: number = 0;
    private evalTimer: number = 0;
    private lastKillCount: number = 0;
    /** Smoothed kills per second */
    private recentKillRate: number = 0;
    private lastWaveIndex: number = 0;
    private events: DifficultyEvent[] = [];
    /** Seconds until the next arena hazard */
    private arenaTimer: number = ArenaSchedule.FIRST;

    reset() {
        this.arenaTimer = ArenaSchedule.FIRST;
        this.intensity = 1;
        this.spawnAccumulator = 0;
        this.evalTimer = 0;
        this.lastKillCount = 0;
        this.recentKillRate = 0;
        this.lastWaveIndex = 0;
        this.events = [];
    }

    update(dt: number, ctx: DifficultyContext) {
        // Wave boundary events (burst + miniboss once per wave)
        const waveIndex = Math.floor(ctx.gameTime / DifficultyDirector.WAVE_DURATION);
        if (waveIndex > this.lastWaveIndex) {
            this.lastWaveIndex = waveIndex;
            this.events.push({ type: 'burst', count: 8 + waveIndex * 4, waveIndex });
            this.events.push({ type: 'miniboss', waveIndex });
        }

        // Stage hazard on its own cadence, independent of the wave clock
        this.arenaTimer -= dt;
        if (this.arenaTimer <= 0) {
            this.arenaTimer = ArenaSchedule.MIN + Math.random() * (ArenaSchedule.MAX - ArenaSchedule.MIN);
            this.events.push({ type: 'arena' });
        }

        // Adapt intensity once per second
        this.evalTimer += dt;
        if (this.evalTimer >= 1) {
            const kills = ctx.killCount - this.lastKillCount;
            this.lastKillCount = ctx.killCount;
            this.recentKillRate = this.recentKillRate * 0.7 + (kills / this.evalTimer) * 0.3;
            this.evalTimer = 0;

            const clearRatio = this.recentKillRate / Math.max(1, this.getSpawnRate(ctx.gameTime));
            const comfort = 0.55 * ctx.playerHpRatio + 0.45 * Math.min(1, clearRatio);

            if (comfort > 0.75) {
                // Player is cruising — turn up the heat
                this.intensity += 0.06;
            } else if (comfort < 0.45) {
                // Player is drowning — ease off faster than we ramp up
                this.intensity -= 0.1;
            }
            this.intensity = Math.min(
                DifficultyDirector.MAX_INTENSITY,
                Math.max(DifficultyDirector.MIN_INTENSITY, this.intensity)
            );
        }

        this.spawnAccumulator += this.getSpawnRate(ctx.gameTime) * dt;
    }

    /** Current spawns per second (base ramp × adaptive intensity) */
    getSpawnRate(gameTime: number): number {
        return Math.min(30, (2 + gameTime / 45) * this.intensity);
    }

    /**
     * Take the number of regular enemies to spawn this frame.
     * Consumes whole spawns from the accumulator, respecting the population cap.
     */
    takeSpawnCount(currentEnemyCount: number): number {
        const cap = Math.min(DifficultyDirector.MAX_ENEMIES, DifficultyDirector.MAX_ENEMIES - currentEnemyCount);
        if (cap <= 0) {
            // Don't bank spawns while at the cap — that would dump a wall of
            // enemies the moment the player clears space.
            this.spawnAccumulator = Math.min(this.spawnAccumulator, 1);
            return 0;
        }
        const budget = Math.min(Math.floor(this.spawnAccumulator), cap);
        this.spawnAccumulator -= budget;
        return budget;
    }

    /** Drain pending wave events (burst / miniboss) */
    consumeEvents(): DifficultyEvent[] {
        if (this.events.length === 0) return this.events;
        const drained = this.events;
        this.events = [];
        return drained;
    }

    /**
     * How far into the run the arena thinks you are — **the later of the clock
     * and your level**, expressed as an equivalent number of seconds.
     *
     * The clock alone had a hole in it big enough to walk a build through. On
     * the hardest stage the opening enemies are too tough to kill, so you kite
     * instead — and because crystals no longer expire, a pile of XP just sits
     * there accumulating at no risk. Clear it in one sweep and you cash five or
     * six levels at once, at minute three, against minute-three enemies. The
     * hardest stage was the easiest place to snowball.
     *
     * This does not take the play pattern away — banking a crowd and detonating
     * it is a good, deliberate thing to do, and the user liked it. It stops it
     * being *free*: out-level the clock and the arena immediately levels with
     * you. Under normal pacing the two terms track each other (roughly six
     * levels a minute against 240s-per-doubling), so nothing changes for a run
     * that is not running ahead of itself.
     */
    private effectiveTime(gameTime: number, playerLevel: number): number {
        return Math.max(gameTime, playerLevel * LEVEL_AS_SECONDS);
    }

    /**
     * Enemy HP multiplier. Growth is uncapped (the old 3x cap is what made
     * late game trivial against exponentially-scaling player damage).
     */
    getHpMultiplier(gameTime: number, playerLevel: number = 0): number {
        return (1 + this.effectiveTime(gameTime, playerLevel) / 240)
            * (0.75 + 0.25 * this.intensity);
    }

    // There is deliberately no contact-damage multiplier here.
    //
    // There used to be — `(1 + t/600) * (0.85 + 0.15 * intensity)`, applied on
    // top of the tier curve and the stage's damageScale. Its own comment said
    // "enemy *count* is what escalates late, not per-enemy bite", and the code
    // said otherwise: end to end, a bite grew x33 across a run against a player
    // pool that grows about x1.2, and a full ring killed in 0.18s.
    //
    // Contact damage is now flat (see core/ContactDamage). This class still
    // escalates the late game through getHpMultiplier and through spawn rate,
    // which is what the sentence above always meant.

    /** Elite spawn chance grows with time and with player overperformance */
    getEliteChance(gameTime: number): number {
        return Math.min(0.08, 0.01 + gameTime / 12000 + Math.max(0, this.intensity - 1) * 0.01);
    }
}

export const difficultyDirector = new DifficultyDirector();
