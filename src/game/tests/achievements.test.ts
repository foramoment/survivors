import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// The `node` test environment has no usable localStorage, and Achievements'
// own try/catch would silently swallow every write — the tests would then pass
// against a permanently empty set.
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
    ACHIEVEMENTS, AchievementTracker, loadUnlocked, resetAchievements,
    type RunSnapshot,
} from '../core/Achievements';
import { RunStatsTracker, MULTIKILL_WINDOW } from '../core/RunStats';

function snapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
    return {
        seconds: 0, kills: 0, level: 1, evolvedWeapons: 0, weapons: 1,
        maxPowerupStack: 0, longestUntouched: 0, bestHit: 0, bestMultikill: 0,
        hpRatio: 1, victory: false, threat: 1,
        ...overrides,
    };
}

describe('Achievements', () => {
    beforeEach(() => resetAchievements());

    it('has unique ids', () => {
        const ids = ACHIEVEMENTS.map(a => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('a fresh run unlocks nothing', () => {
        const tracker = new AchievementTracker();
        tracker.check(snapshot());
        expect(tracker.take()).toBeNull();
    });

    it('unlocks when the condition is met, and only once', () => {
        const tracker = new AchievementTracker();
        tracker.check(snapshot({ kills: 120 }));

        const first = tracker.take();
        expect(first?.id).toBe('first_blood');
        expect(tracker.take()).toBeNull();

        // Same condition next tick must not re-queue it
        tracker.check(snapshot({ kills: 200 }));
        expect(tracker.take()).toBeNull();
    });

    it('persists across trackers', () => {
        new AchievementTracker().check(snapshot({ kills: 120 }));
        expect(loadUnlocked().has('first_blood')).toBe(true);

        const fresh = new AchievementTracker();
        fresh.check(snapshot({ kills: 120 }));
        expect(fresh.take()).toBeNull();
    });

    it('queues several unlocks rather than dropping them', () => {
        const tracker = new AchievementTracker();
        tracker.check(snapshot({ kills: 120, evolvedWeapons: 1 }));
        expect(tracker.take()).not.toBeNull();
        expect(tracker.take()).not.toBeNull();
    });

    it('clearQueue drops pending toasts without re-locking anything', () => {
        const tracker = new AchievementTracker();
        tracker.check(snapshot({ kills: 120 }));
        tracker.clearQueue();
        expect(tracker.take()).toBeNull();
        expect(tracker.unlockedIds.has('first_blood')).toBe(true);
    });
});

describe('RunStatsTracker', () => {
    it('keeps the biggest hit and what threw it', () => {
        const tracker = new RunStatsTracker();
        tracker.recordHit(100, false, 'void_ray');
        tracker.recordHit(420, true, 'lightning_chain');
        tracker.recordHit(80, true, 'acid_pool');

        expect(tracker.stats.bestHit).toBe(420);
        expect(tracker.stats.bestHitCrit).toBe(true);
        expect(tracker.stats.bestHitWeaponId).toBe('lightning_chain');
    });

    it('tracks the longest untouched stretch, not the current one', () => {
        const tracker = new RunStatsTracker();
        tracker.update(30);
        tracker.onPlayerHurt();
        tracker.update(5);

        expect(tracker.stats.longestUntouched).toBeCloseTo(30);
    });

    it('counts kills inside one window as a single multikill', () => {
        const tracker = new RunStatsTracker();
        for (let i = 0; i < 4; i++) {
            tracker.recordKill();
            tracker.update(MULTIKILL_WINDOW / 2);
        }
        expect(tracker.stats.bestMultikill).toBe(4);

        // A gap breaks the chain
        tracker.update(MULTIKILL_WINDOW * 2);
        tracker.recordKill();
        expect(tracker.stats.bestMultikill).toBe(4);
    });

    it('reset clears everything', () => {
        const tracker = new RunStatsTracker();
        tracker.recordHit(500, true, 'void_ray');
        tracker.reset();
        expect(tracker.stats.bestHit).toBe(0);
        expect(tracker.stats.bestHitWeaponId).toBeNull();
    });
});
