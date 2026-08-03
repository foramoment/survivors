/**
 * ACHIEVEMENTS — the long game.
 *
 * A run ends and everything it earned disappears. Achievements are the thread
 * between runs: they name things worth trying that the game never asks you to
 * do, and they turn a losing run into a run that still produced something.
 *
 * Design rules this list follows:
 *   - every one names a *behaviour*, not a grind. "Survive 5 minutes without
 *     being touched" is a way to play; "kill 10000 enemies" is a wait.
 *   - each is checkable from the run snapshot below, so nothing needs its own
 *     hook scattered through the game
 *   - they are checked on a tick, not on every event, because the expensive
 *     part is the DOM toast and we only ever want one at a time
 *
 * Progress is local (localStorage) for the same reason the leaderboard is: the
 * build is a static bundle that has to work offline under Capacitor.
 */

const STORAGE_KEY = 'survivors.achievements.v1';

/** Everything an achievement condition is allowed to look at */
export interface RunSnapshot {
    seconds: number;
    kills: number;
    level: number;
    /** Weapons at level 6 */
    evolvedWeapons: number;
    /** Distinct weapons held */
    weapons: number;
    /** Highest stack count on any single powerup */
    maxPowerupStack: number;
    longestUntouched: number;
    bestHit: number;
    bestMultikill: number;
    hpRatio: number;
    victory: boolean;
    /** Arena threat multiplier of the stage being played */
    threat: number;
}

export interface Achievement {
    id: string;
    emoji: string;
    /** Fallback English name/description; ru comes from the locale by id */
    name: string;
    description: string;
    check: (run: RunSnapshot) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'first_blood', emoji: '🩸',
        name: 'First Blood', description: 'Kill 100 enemies in one run',
        check: r => r.kills >= 100,
    },
    {
        id: 'untouchable', emoji: '🕊️',
        name: 'Untouchable', description: 'Go 3 minutes without taking a scratch',
        check: r => r.longestUntouched >= 180,
    },
    {
        id: 'evolution', emoji: '🌟',
        name: 'Evolution', description: 'Evolve a weapon',
        check: r => r.evolvedWeapons >= 1,
    },
    {
        id: 'arsenal', emoji: '⚔️',
        name: 'Full Arsenal', description: 'Carry five weapons at once',
        check: r => r.weapons >= 5,
    },
    {
        id: 'apex', emoji: '👑',
        name: 'Apex Predator', description: 'Evolve three weapons in one run',
        check: r => r.evolvedWeapons >= 3,
    },
    {
        id: 'overkill', emoji: '💥',
        // 2500, not 5000: hits are written in the same units as enemy health
        // now, and both were halved together when GLOBAL_DAMAGE was removed
        name: 'Overkill', description: 'Land a single hit for 2500',
        check: r => r.bestHit >= 2500,
    },
    {
        id: 'reaper', emoji: '☠️',
        name: 'Reaper', description: 'Kill 15 enemies in one heartbeat',
        check: r => r.bestMultikill >= 15,
    },
    {
        id: 'specialist', emoji: '🎯',
        name: 'Specialist', description: 'Stack one perk to the cap',
        check: r => r.maxPowerupStack >= 8,
    },
    {
        id: 'survivor', emoji: '⏳',
        name: 'Survivor', description: 'Last ten minutes',
        check: r => r.seconds >= 600,
    },
    {
        id: 'clear', emoji: '🏆',
        name: 'Stage Clear', description: 'Beat a stage boss',
        check: r => r.victory,
    },
    {
        id: 'on_the_edge', emoji: '🔥',
        name: 'On The Edge', description: 'Reach level 30 below a fifth of your HP',
        check: r => r.level >= 30 && r.hpRatio <= 0.2,
    },
    {
        id: 'nexus', emoji: '🌀',
        name: 'Into The Nexus', description: 'Clear the hardest arena',
        check: r => r.victory && r.threat >= 1.5,
    },
];

export function loadUnlocked(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? new Set(parsed.filter(id => typeof id === 'string')) : new Set();
    } catch {
        return new Set();
    }
}

function persist(unlocked: Set<string>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
    } catch {
        // Private mode — the unlock still shows this session, it just won't stick
    }
}

export function resetAchievements(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing stored to begin with
    }
}

/**
 * Watches a run and reports achievements as they unlock.
 *
 * Holds its own copy of the unlocked set so a check is a Set lookup rather than
 * a localStorage read — this runs on a timer during gameplay.
 */
export class AchievementTracker {
    private unlocked: Set<string> = loadUnlocked();
    /** Unlocks waiting to be shown, in order */
    private queue: Achievement[] = [];

    get unlockedIds(): Set<string> {
        return this.unlocked;
    }

    /** Evaluate every locked achievement; newly unlocked ones join the queue */
    check(run: RunSnapshot): void {
        let changed = false;
        for (const achievement of ACHIEVEMENTS) {
            if (this.unlocked.has(achievement.id)) continue;
            if (!achievement.check(run)) continue;
            this.unlocked.add(achievement.id);
            this.queue.push(achievement);
            changed = true;
        }
        if (changed) persist(this.unlocked);
    }

    /** Next unlock to display, or null */
    take(): Achievement | null {
        return this.queue.shift() ?? null;
    }

    /** Drop pending toasts (leaving a run shouldn't spray them at the menu) */
    clearQueue(): void {
        this.queue.length = 0;
    }

    /** Re-read storage after a reset from the achievements screen */
    reload(): void {
        this.unlocked = loadUnlocked();
        this.queue.length = 0;
    }
}

export const achievements = new AchievementTracker();
