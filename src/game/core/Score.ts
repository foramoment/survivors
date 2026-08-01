/**
 * SCORE — one number for "how did that run go", plus a local leaderboard.
 *
 * A survivors run already produces four numbers (time, kills, level, win/lose)
 * and none of them alone says whether one run beat another: dying at 9:00 with
 * 2000 kills is not obviously better or worse than surviving to 10:30 doing
 * nothing. The score exists to make runs comparable, so it has to reward every
 * axis the game actually asks for:
 *
 *   kills  — weighted by the enemy's XP value, which already tracks its tier,
 *            so grinding weak spawns is worth less than fighting up the curve
 *   time   — flat per second; simply lasting is the core of the genre
 *   level  — the XP curve is already superlinear, so this stays linear rather
 *            than double-counting
 *   stage  — multiplied by the arena's threat, so a harder stage is worth more
 *   win    — a bonus multiplier, so clearing a stage always beats dying at the
 *            same point in it
 *
 * The leaderboard is local (localStorage). No server, no accounts — the game
 * ships as a static bundle and has to work offline under Capacitor.
 */

export const POINTS_PER_KILL_XP = 12;
export const POINTS_PER_SECOND = 6;
export const POINTS_PER_LEVEL = 40;
export const VICTORY_MULTIPLIER = 1.25;

export const LEADERBOARD_SIZE = 10;
const STORAGE_KEY = 'survivors.scores.v1';

export interface RunResult {
    /** Sum of xpValue over every enemy killed (tier-weighted kill count) */
    killScore: number;
    seconds: number;
    level: number;
    /** Arena threat: the average of the stage's HP and damage multipliers */
    threat: number;
    victory: boolean;
}

export function computeScore(run: RunResult): number {
    const base =
        run.killScore * POINTS_PER_KILL_XP +
        run.seconds * POINTS_PER_SECOND +
        run.level * POINTS_PER_LEVEL;
    const multiplier = run.threat * (run.victory ? VICTORY_MULTIPLIER : 1);
    return Math.max(0, Math.round(base * multiplier));
}

export interface ScoreEntry {
    score: number;
    stageId: string;
    classId: string;
    seconds: number;
    kills: number;
    level: number;
    victory: boolean;
    /** Epoch ms — passed in by the caller so this module stays pure */
    date: number;
}

/** Digits grouped for readability: 128400 -> "128 400" */
export function formatScore(score: number): string {
    return Math.round(score).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function loadScores(): ScoreEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // A corrupt or hand-edited entry must not break the menu
        return parsed
            .filter((e: any) => e && typeof e.score === 'number')
            .slice(0, LEADERBOARD_SIZE);
    } catch {
        return [];
    }
}

/**
 * Insert a run and persist the top LEADERBOARD_SIZE.
 * Returns the stored table and the new entry's rank (1-based, 0 if it missed).
 */
export function submitScore(entry: ScoreEntry): { scores: ScoreEntry[]; rank: number } {
    const scores = [...loadScores(), entry].sort((a, b) => b.score - a.score);
    const kept = scores.slice(0, LEADERBOARD_SIZE);
    const rank = kept.indexOf(entry) + 1;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    } catch {
        // Storage unavailable (private mode) — the run still gets its score,
        // it just won't be there next session
    }

    return { scores: kept, rank };
}

export function clearScores(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do — there was nothing stored to begin with
    }
}
