/**
 * RUN STATS — the numbers a run earns that are worth bragging about.
 *
 * Time / kills / level answer "how far did you get". These answer "what
 * happened", which is the part players actually retell: the crit that deleted a
 * miniboss, the four minutes without being touched, the eleven enemies that
 * died in one blast.
 *
 * Deliberately NOT tracked: damage per weapon. A leaderboard of your own
 * weapons turns build variety into a solved problem — everyone would just read the
 * table and take the top one every run. The best crit names its weapon because
 * that is a *moment*, not a ranking.
 */

export interface RunStats {
    /** Biggest single hit of the run, and what threw it */
    bestHit: number;
    bestHitCrit: boolean;
    bestHitWeaponId: string | null;
    /** Longest stretch, in seconds, without taking any damage */
    longestUntouched: number;
    /** Most enemies killed inside one MULTIKILL_WINDOW */
    bestMultikill: number;
    /** Every point of damage the player dealt this run */
    totalDamage: number;
    /**
     * Every point of HP the player got back — regen, repair cells, anything.
     * Often zero, which is itself worth showing: it says out loud that this
     * run had no sustain in it, and sustain is a thing you can go build.
     */
    totalHealed: number;
}

/** Kills this far apart still count as one multikill */
export const MULTIKILL_WINDOW = 0.35;

export function createRunStats(): RunStats {
    return {
        bestHit: 0,
        bestHitCrit: false,
        bestHitWeaponId: null,
        longestUntouched: 0,
        bestMultikill: 0,
        totalDamage: 0,
        totalHealed: 0,
    };
}

/**
 * Live counters that feed the records above. Kept separate from RunStats so the
 * end-of-run panel gets a clean record with no bookkeeping in it.
 */
export class RunStatsTracker {
    stats: RunStats = createRunStats();

    private untouchedFor: number = 0;
    private multikillCount: number = 0;
    private multikillTimer: number = 0;

    reset(): void {
        this.stats = createRunStats();
        this.untouchedFor = 0;
        this.multikillCount = 0;
        this.multikillTimer = 0;
    }

    update(dt: number): void {
        this.untouchedFor += dt;
        if (this.untouchedFor > this.stats.longestUntouched) {
            this.stats.longestUntouched = this.untouchedFor;
        }

        if (this.multikillTimer > 0) {
            this.multikillTimer -= dt;
            if (this.multikillTimer <= 0) this.multikillCount = 0;
        }
    }

    /** Any damage to the player breaks the untouched streak */
    onPlayerHurt(): void {
        this.untouchedFor = 0;
    }

    /** HP the player got back, from any source */
    recordHeal(amount: number): void {
        if (amount > 0) this.stats.totalHealed += amount;
    }

    recordHit(damage: number, isCrit: boolean, weaponId: string | null): void {
        this.stats.totalDamage += damage;
        if (damage <= this.stats.bestHit) return;
        this.stats.bestHit = damage;
        this.stats.bestHitCrit = isCrit;
        this.stats.bestHitWeaponId = weaponId;
    }

    /**
     * A kill extends the multikill window rather than restarting it from zero,
     * so a chain of explosions reads as one big moment instead of several.
     */
    recordKill(): void {
        this.multikillCount++;
        this.multikillTimer = MULTIKILL_WINDOW;
        if (this.multikillCount > this.stats.bestMultikill) {
            this.stats.bestMultikill = this.multikillCount;
        }
    }
}
