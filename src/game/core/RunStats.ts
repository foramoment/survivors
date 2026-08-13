/**
 * RUN STATS — the numbers a run earns that are worth bragging about.
 *
 * Time / kills / level answer "how far did you get". These answer "what
 * happened", which is the part players actually retell: the crit that deleted a
 * miniboss, the four minutes without being touched, the eleven enemies that
 * died in one blast.
 *
 * Damage per weapon used to be deliberately absent here, on the grounds that a
 * leaderboard of your own weapons turns build variety into a solved problem.
 * That reasoning still holds for a *ranking*, and it is why the per-weapon table
 * is written into the copy-stats dump and not onto the end screen.
 *
 * What forced it in anyway: a run where the Singularity Orb held a huge crowd,
 * the damage counter ran to 442k at 2123/s, and almost nothing died — enemies
 * that deep into Void Nexus carry roughly 3000 HP against a best hit of 81. The
 * summary said "damage" and the player read "output", and the two had come
 * apart. **Damage is an input; kills are the output.** A weapon with 40% of the
 * damage and 3% of the killing blows is not strong and not weak — it is spread,
 * and no single number could say so.
 *
 * Hence the three additions below: killing blows per weapon, how much enemy
 * health the run actually destroyed, and how long one incoming enemy takes to
 * kill right now.
 */

/**
 * Smoothing for the two live averages behind `ttk`, applied once per second.
 *
 * 0.9 is a ten-second memory: long enough that a single lucky volley does not
 * swing it, short enough that the number at the end of the run describes the
 * end of the run. A run average would be useless here — the wall the player
 * hits is a late-run event, and averaging it against the opening minute is
 * exactly how it stayed invisible.
 */
export const TTK_SMOOTHING = 0.9;

/** Damage dealt and killing blows landed, for one weapon */
export interface WeaponTally {
    damage: number;
    kills: number;
}

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

    /**
     * The other half of the sustain question, and the half that was missing.
     *
     * "5994 HP healed" says nothing on its own — healed against *what*? These
     * three make the answer readable: how much came in, over how long enemies
     * were actually on you, and how deep the worst pile got. Damage divided by
     * contact seconds is the average drain; contact seconds over run time is
     * how much of the run you spent being touched at all.
     *
     * Tracked because balancing contact damage by feel took three rewrites, and
     * every time the missing thing was a number nobody was writing down.
     */
    damageTaken: number;
    /**
     * Seconds with at least one enemy touching the player.
     *
     * This used to be `bitesTaken`, a count of discrete bites. Contact is a
     * continuous drain again (see core/ContactDamage), so a count would just be
     * frames-with-contact — a number that changes meaning with the frame rate
     * and tells you nothing. Time is the honest denominator for a drain.
     */
    contactSeconds: number;
    /** Most enemies touching the player at once */
    worstPileUp: number;

    /**
     * Per weapon id: damage dealt and killing blows landed. Weapons appear here
     * the first time they connect, so a weapon that never hit anything is
     * absent — which is itself the answer to "was that pick worth it".
     */
    weapons: Map<string, WeaponTally>;

    /**
     * Total `maxHp` of everything that died.
     *
     * Against `totalDamage` this is the conversion rate: how much of the damage
     * became a corpse rather than being spread across a crowd that walked away.
     * It is never 100% — the killing blow overshoots, and damage-over-time on
     * survivors is real work — but a build sitting at 20% is being told
     * something the damage total cannot tell it.
     */
    hpDestroyed: number;

    /**
     * Seconds to kill one enemy of the kind currently arriving, as of the end
     * of the run: smoothed incoming enemy HP over smoothed damage per second.
     *
     * The one number that says "your damage curve has fallen off the enemy HP
     * curve", which is the failure this whole block exists to catch. Zero until
     * the run has dealt any damage at all.
     */
    ttk: number;
    /** The two halves of `ttk`, kept because the ratio alone is unfalsifiable */
    arenaHp: number;
    dps: number;
}

/** Kills this far apart still count as one multikill */
export const MULTIKILL_WINDOW = 0.35;

/**
 * ...and however tightly they keep coming, one multikill may not run longer
 * than this.
 *
 * Without the ceiling the counter measured the wrong thing. Each kill refreshed
 * the 0.35s window, so a build clearing 15 enemies a second never left a gap
 * long enough to close it — a real 10:36 clear reported "best combo x485",
 * which was not one blast but **thirty-two seconds during which the arena never
 * went quiet**. Early in a run it meant what it said; late in a run it had
 * quietly become a streak counter, and the label still said multikill.
 *
 * 1.2s is chosen against the weapons, not against the number: chained and
 * staggered effects spread their damage across frames on purpose (Lightning
 * hops on `hopInterval`, Orbital Strike fires its volley in sequence), and a
 * cascade should still read as one moment. Anything longer than this is a good
 * minute of play, not a moment.
 */
export const MULTIKILL_MAX = 1.2;

export function createRunStats(): RunStats {
    return {
        bestHit: 0,
        bestHitCrit: false,
        bestHitWeaponId: null,
        longestUntouched: 0,
        bestMultikill: 0,
        totalDamage: 0,
        totalHealed: 0,
        damageTaken: 0,
        contactSeconds: 0,
        worstPileUp: 0,
        weapons: new Map(),
        hpDestroyed: 0,
        ttk: 0,
        arenaHp: 0,
        dps: 0,
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
    /** How long the multikill in progress has been running (see MULTIKILL_MAX) */
    private multikillAge: number = 0;

    /** Damage this second, folded into `dpsAvg` when the second closes */
    private secondDamage: number = 0;
    private secondTimer: number = 0;
    private dpsAvg: number = 0;
    /** Smoothed `maxHp` of enemies as they spawn — how tough the arena is now */
    private arenaHpAvg: number = 0;

    reset(): void {
        this.stats = createRunStats();
        this.untouchedFor = 0;
        this.multikillCount = 0;
        this.multikillTimer = 0;
        this.multikillAge = 0;
        this.secondDamage = 0;
        this.secondTimer = 0;
        this.dpsAvg = 0;
        this.arenaHpAvg = 0;
    }

    update(dt: number): void {
        this.untouchedFor += dt;
        if (this.untouchedFor > this.stats.longestUntouched) {
            this.stats.longestUntouched = this.untouchedFor;
        }

        if (this.multikillTimer > 0) {
            this.multikillTimer -= dt;
            this.multikillAge += dt;
            if (this.multikillTimer <= 0) this.multikillCount = 0;
        }

        // Damage is smoothed by the second rather than by the frame: a volley
        // that lands in one frame is not 40k DPS, it is one volley.
        this.secondTimer += dt;
        if (this.secondTimer >= 1) {
            const dps = this.secondDamage / this.secondTimer;
            this.dpsAvg = this.dpsAvg === 0
                ? dps
                : this.dpsAvg * TTK_SMOOTHING + dps * (1 - TTK_SMOOTHING);
            this.secondDamage = 0;
            this.secondTimer = 0;
            this.refreshTtk();
        }
    }

    /**
     * How tough one arriving enemy is, sampled at spawn.
     *
     * Measured on spawns rather than on kills, because the case worth catching
     * is the one where nothing is dying — a kill-based average goes blank
     * exactly when the player most needs the number. Bosses are excluded by the
     * caller: a single body worth twelve enemies would swamp the average and
     * turn TTK into a boss-fight statistic.
     */
    recordSpawn(maxHp: number): void {
        if (maxHp <= 0) return;
        this.arenaHpAvg = this.arenaHpAvg === 0
            ? maxHp
            : this.arenaHpAvg * TTK_SMOOTHING + maxHp * (1 - TTK_SMOOTHING);
        this.refreshTtk();
    }

    private refreshTtk(): void {
        this.stats.arenaHp = this.arenaHpAvg;
        this.stats.dps = this.dpsAvg;
        this.stats.ttk = this.dpsAvg > 0 ? this.arenaHpAvg / this.dpsAvg : 0;
    }

    /** The running tally for one weapon, created on first contact */
    private tally(weaponId: string): WeaponTally {
        let entry = this.stats.weapons.get(weaponId);
        if (!entry) {
            entry = { damage: 0, kills: 0 };
            this.stats.weapons.set(weaponId, entry);
        }
        return entry;
    }

    /** Any damage to the player breaks the untouched streak */
    onPlayerHurt(): void {
        this.untouchedFor = 0;
    }

    /**
     * This frame's share of the contact drain, and how long it lasted.
     *
     * Called only while something is actually touching the player, so the
     * seconds accrue even on a frame that cost no health — a shielded frame is
     * still a frame spent in the pile, and "in contact" would otherwise stop
     * counting exactly when a deflector was doing its job.
     */
    recordContact(damage: number, dt: number): void {
        this.stats.contactSeconds += dt;
        if (damage > 0) this.stats.damageTaken += damage;
    }

    /** Discrete environmental damage — a meteor, a rift collapsing */
    recordHazard(damage: number): void {
        if (damage > 0) this.stats.damageTaken += damage;
    }

    /** How many enemies were touching the player this frame */
    recordPileUp(count: number): void {
        if (count > this.stats.worstPileUp) this.stats.worstPileUp = count;
    }

    /** HP the player got back, from any source */
    recordHeal(amount: number): void {
        if (amount > 0) this.stats.totalHealed += amount;
    }

    recordHit(damage: number, isCrit: boolean, weaponId: string | null): void {
        this.stats.totalDamage += damage;
        this.secondDamage += damage;
        if (weaponId) this.tally(weaponId).damage += damage;

        if (damage <= this.stats.bestHit) return;
        this.stats.bestHit = damage;
        this.stats.bestHitCrit = isCrit;
        this.stats.bestHitWeaponId = weaponId;
    }

    /**
     * A kill extends the multikill window rather than restarting it from zero,
     * so a chain of explosions reads as one big moment instead of several.
     *
     * `maxHp` is the enemy's full health, not what was left of it: the question
     * `hpDestroyed` answers is how much health the run removed from the arena,
     * and an enemy is worth its whole bar however many weapons chipped it.
     * `weaponId` is whoever landed the last hit — null for the arena's own
     * kills, which is why the shares below are shares of attributed kills.
     */
    recordKill(maxHp: number = 0, weaponId: string | null = null): void {
        // A new multikill starts when the last one has gone quiet OR when it has
        // run its full length. The second half is what stops a sustained clear
        // from refreshing the same combo forever — see MULTIKILL_MAX.
        if (this.multikillTimer <= 0 || this.multikillAge >= MULTIKILL_MAX) {
            this.multikillCount = 0;
            this.multikillAge = 0;
        }

        this.multikillCount++;
        this.multikillTimer = MULTIKILL_WINDOW;
        if (this.multikillCount > this.stats.bestMultikill) {
            this.stats.bestMultikill = this.multikillCount;
        }

        this.stats.hpDestroyed += Math.max(0, maxHp);
        if (weaponId) this.tally(weaponId).kills++;
    }
}
