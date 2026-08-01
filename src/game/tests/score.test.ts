import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// The suite runs in the `node` environment, where localStorage is either
// missing or backed by a file that is not writable here. Score's own try/catch
// would then quietly swallow every write and the leaderboard tests would pass
// against a permanently empty table — so give it a real in-memory store.
beforeAll(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, String(v)),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        },
    });
});

import {
    computeScore, submitScore, loadScores, clearScores, formatScore,
    LEADERBOARD_SIZE, type ScoreEntry,
} from '../core/Score';

function entry(score: number): ScoreEntry {
    return {
        score,
        stageId: 'asteroid_fields',
        classId: 'void_walker',
        seconds: 300,
        kills: 500,
        level: 20,
        victory: false,
        date: 1,
    };
}

const RUN = { killScore: 1000, seconds: 600, level: 40, threat: 1, victory: false };

describe('computeScore', () => {
    it('rewards every axis the game asks for', () => {
        const base = computeScore(RUN);
        expect(computeScore({ ...RUN, killScore: 2000 })).toBeGreaterThan(base);
        expect(computeScore({ ...RUN, seconds: 900 })).toBeGreaterThan(base);
        expect(computeScore({ ...RUN, level: 50 })).toBeGreaterThan(base);
    });

    it('weights kills by tier, not by count', () => {
        // killScore is the sum of xpValue, which grows with the enemy tier —
        // farming the weakest spawns is worth less than fighting up the curve
        const weak = computeScore({ ...RUN, killScore: 500 });
        const strong = computeScore({ ...RUN, killScore: 1500 });
        expect(strong - weak).toBeGreaterThan(0);
    });

    it('a harder arena is worth more', () => {
        expect(computeScore({ ...RUN, threat: 1.9 }))
            .toBeGreaterThan(computeScore({ ...RUN, threat: 1 }));
    });

    it('clearing a stage always beats dying at the same point in it', () => {
        expect(computeScore({ ...RUN, victory: true })).toBeGreaterThan(computeScore(RUN));
    });

    it('never goes negative', () => {
        expect(computeScore({ killScore: 0, seconds: 0, level: 0, threat: 1, victory: false })).toBe(0);
    });
});

describe('formatScore', () => {
    it('groups digits', () => {
        expect(formatScore(1234567)).toBe('1 234 567');
        expect(formatScore(42)).toBe('42');
    });
});

describe('leaderboard', () => {
    beforeEach(() => clearScores());

    it('starts empty', () => {
        expect(loadScores()).toEqual([]);
    });

    it('sorts by score and reports the rank', () => {
        submitScore(entry(100));
        submitScore(entry(300));
        const { scores, rank } = submitScore(entry(200));

        expect(scores.map(s => s.score)).toEqual([300, 200, 100]);
        expect(rank).toBe(2);
    });

    it('keeps only the top N', () => {
        for (let i = 0; i < LEADERBOARD_SIZE + 5; i++) submitScore(entry(i * 10));
        expect(loadScores().length).toBe(LEADERBOARD_SIZE);
    });

    it('reports rank 0 for a run that missed the table', () => {
        for (let i = 0; i < LEADERBOARD_SIZE; i++) submitScore(entry(1000 + i));
        const { rank } = submitScore(entry(1));
        expect(rank).toBe(0);
    });

    it('survives corrupt storage instead of breaking the menu', () => {
        localStorage.setItem('survivors.scores.v1', 'not json');
        expect(loadScores()).toEqual([]);
    });
});
