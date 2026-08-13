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
import { RunStatsTracker, MULTIKILL_WINDOW, MULTIKILL_MAX } from '../core/RunStats';
import { XPCrystal } from '../entities/XPCrystal';

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

    /**
     * A build clearing 15 enemies a second never leaves a 0.35s gap, so the
     * refreshing window never closed and the counter stopped meaning multikill.
     * A real 10:36 clear reported x485 — thirty-two seconds of the arena never
     * going quiet, printed under a label that promised one blast.
     */
    it('a sustained stream cannot refresh one combo forever', () => {
        const tracker = new RunStatsTracker();
        // Two minutes at fifteen kills a second, no gap ever long enough to
        // break the window
        for (let i = 0; i < 1800; i++) {
            tracker.recordKill();
            tracker.update(1 / 15);
        }

        // Bounded by MULTIKILL_MAX, not by the two minutes
        expect(tracker.stats.bestMultikill).toBeLessThanOrEqual(Math.ceil(MULTIKILL_MAX * 15) + 1);
        // ...and still a real number, not a reset-to-one every frame
        expect(tracker.stats.bestMultikill).toBeGreaterThan(10);
    });

    it('one blast still counts every body in it', () => {
        const tracker = new RunStatsTracker();
        // Kill Echo popping a held pile: no time passes between them at all
        for (let i = 0; i < 200; i++) tracker.recordKill();
        expect(tracker.stats.bestMultikill).toBe(200);
    });

    it('a staggered cascade is still one moment', () => {
        const tracker = new RunStatsTracker();
        // Lightning hopping on its interval — damage spread across frames on
        // purpose, and it must not be split into separate combos
        for (let i = 0; i < 12; i++) {
            tracker.recordKill();
            tracker.update(0.08);
        }
        expect(tracker.stats.bestMultikill).toBe(12);
    });

    it('reset clears everything', () => {
        const tracker = new RunStatsTracker();
        tracker.recordHit(500, true, 'void_ray');
        tracker.reset();
        expect(tracker.stats.bestHit).toBe(0);
        expect(tracker.stats.bestHitWeaponId).toBeNull();
    });
});

describe('XP crystals', () => {
    it('never expire — the drops you kite away from must still be there', () => {
        const crystal = new XPCrystal(0, 0, 5);
        crystal.update(120);
        expect(crystal.isDead).toBe(false);
    });

    it('a merged crystal carries the combined value and reads bigger', () => {
        const crystal = new XPCrystal(0, 0, 5);
        const smallRadius = crystal.radius;
        crystal.setValue(60);
        expect(crystal.value).toBe(60);
        expect(crystal.radius).toBeGreaterThan(smallRadius);
    });
});
