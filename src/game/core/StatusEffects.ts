/**
 * StatusEffects — debuffs that live on an enemy instead of on a zone.
 *
 * Zones only hurt what is standing inside them; a status keeps working after
 * the enemy walks out, which is what makes fungal/psionic weapons feel
 * different from "another circle of damage".
 *
 * Three effects:
 *   infection — damage over time, in three flavours (`kind`) that differ only
 *               in how they read on screen: spores, acid, fire. Can be
 *               *contagious*: when a carrier dies it bursts and infects
 *               everything nearby, so a fungal build snowballs through a crowd.
 *               Spread generations are capped so one cloud cannot chain across
 *               the entire arena forever.
 *   corrosion — the enemy takes MORE damage from every source while it lasts.
 *               This is the one effect that does no damage itself: it is a
 *               setup, which is what makes acid worth building around next to
 *               a big single hitter like Orbital Strike.
 *   stun      — the enemy stops moving (it still animates and takes damage).
 *
 * The state lives on the Enemy (one object, no map lookups); all the logic
 * lives here so nothing else has to know how it ticks.
 */

import { damageSystem } from './DamageSystem';
import { levelSpatialHash } from '../../engine/SpatialHash';
import { particles } from '../../engine/ParticleSystem';
import { distance } from '../../engine/Utils';
import type { Enemy } from '../entities/Enemy';

/** Seconds between damage ticks — also how often damage numbers appear */
const TICK = 0.6;
/** How many times a contagious infection may jump before it burns out */
const MAX_GENERATIONS = 3;
/**
 * Immunity after a stun, as a multiple of that stun's length. At 2 an enemy can
 * be frozen at most a third of the time no matter how many stun sources or how
 * much duration a build stacks.
 */
export const STUN_RECOVERY_RATIO = 2;

/**
 * What is left of a `flat` (percent-of-max-HP) burn when it lands on a boss.
 *
 * A boss is a health pool an order of magnitude past anything else on the
 * field, which is exactly what a percentage of max health is worst against:
 * Kill Echo's burn alone was 22% of a boss's total per proc, and it did not go
 * through `KILL_ECHO_BOSS_RESIST` because that only guards the direct blast.
 * The player watched a boss bar collapse while farming the trash around it —
 * failure mode #2 from KILL_ECHO_DAMAGE_SHARE, which had simply moved from the
 * blast into the burn.
 *
 * The same courtesy every stun source gives a boss, and the same rule League
 * applies to max-health damage against monsters.
 */
export const BOSS_FLAT_RESIST = 0.25;

/** Purely cosmetic — picks the colour of the orbiting motes on the enemy */
export type InfectionKind = 'spore' | 'acid' | 'burn';

export interface Infection {
    /** Base damage per second (goes through DamageSystem, so might/crit apply) */
    dps: number;
    /**
     * This dps is already measured against the target (a share of its max HP),
     * so it must NOT be multiplied by the player's damage stats. See
     * `InfectParams.flat`.
     */
    flat: boolean;
    /** Seconds left */
    timer: number;
    /** Countdown to the next damage tick */
    tick: number;
    contagious: boolean;
    spreadRadius: number;
    generation: number;
    kind: InfectionKind;
    source: any;
}

export interface InfectParams {
    dps: number;
    duration: number;
    source: any;
    contagious?: boolean;
    spreadRadius?: number;
    generation?: number;
    kind?: InfectionKind;
    /**
     * The dps is a share of the target's own max HP (Kill Echo's burn, Static
     * Discharge's burn) rather than a weapon number.
     *
     * Such a burn is **already** scaled to whatever it landed on, so running it
     * through might and crit on top scales it twice. Against a late-game body
     * that is the difference between a perk and the entire build: a 48k-HP
     * enemy burning at 9% of its own maximum is 4320 dps, next to the 37 dps
     * the fungal mat that infected it actually deals.
     *
     * Flat infections are dealt with `skipModifiers` and are cut against bosses
     * — see BOSS_FLAT_RESIST.
     */
    flat?: boolean;
}

/**
 * Damage amplification. Does no damage on its own — it makes everything else
 * hit harder, so acid pays off through whatever else you are running.
 */
export interface Corrosion {
    /** 0.25 = the enemy takes +25% damage from every source */
    amp: number;
    timer: number;
}

export interface CorrodeParams {
    amp: number;
    duration: number;
}

export class StatusSystem {
    /**
     * Apply (or refresh) an infection. **The stronger one wins, whole.**
     *
     * This used to merge field by field — `dps` and `timer` took the maximum,
     * and `source` took whatever arrived last — and the combination was the
     * single worst balance bug the game has had. It built infections that never
     * existed:
     *
     *   1. Kill Echo leaves a burn at 9% of the target's **max HP** per second.
     *      On a late Void Nexus body that is 4320 dps, and it is `flat`, so it
     *      is meant to land unmodified.
     *   2. The fungal mat the enemy is standing in re-infects it a tick later
     *      with its own 37 dps and **its own source**.
     *   3. The merge kept the burn's 4320 dps, took the mat's source, and
     *      dropped the flat marker. From then on the perk's burn ran through
     *      might and crit — and was credited to the mushroom.
     *
     * A measured run: Fungal Bloom reported 66% of all damage and 71% of all
     * kills, with a best hit of 718,348. Almost none of that was the mushroom.
     *
     * Taking the whole effect from one side removes the class of bug rather
     * than this instance of it: no borrowed timers, no borrowed source, no
     * borrowed modifier rule. A weaker infection simply does not land — the
     * standard "strongest DoT applies" rule from every ARPG that has ever
     * shipped two damage-over-time effects.
     */
    infect(enemy: Enemy, params: InfectParams) {
        const current = enemy.infection;
        // `>=` so a mat refreshing its own infection still renews the timer
        if (current && current.dps > params.dps) return;

        const flat = !!params.flat;
        // Percent-of-max-HP damage is at its most absurd against the one health
        // pool built to be enormous — see BOSS_FLAT_RESIST
        const dps = flat && enemy.isBoss ? params.dps * BOSS_FLAT_RESIST : params.dps;

        enemy.infection = {
            dps,
            flat,
            timer: params.duration,
            tick: TICK,
            contagious: !!params.contagious,
            spreadRadius: params.spreadRadius ?? 0,
            generation: params.generation ?? 0,
            kind: params.kind ?? 'spore',
            source: params.source,
        };
    }

    /**
     * Apply (or refresh) corrosion. The stronger amp and longer timer win, so
     * two acid sources never multiply into something absurd.
     */
    corrode(enemy: Enemy, params: CorrodeParams) {
        const current = enemy.corrosion;
        if (current) {
            current.amp = Math.max(current.amp, params.amp);
            current.timer = Math.max(current.timer, params.duration);
            return;
        }
        enemy.corrosion = { amp: params.amp, timer: params.duration };
    }

    /** Multiplier every incoming hit is scaled by (see DamageSystem) */
    damageTakenMultiplier(enemy: Enemy): number {
        return 1 + (enemy.corrosion?.amp ?? 0);
    }

    /**
     * Freeze an enemy in place for `seconds`.
     *
     * Every stun leaves the target briefly **immune** to being stunned again.
     * Without it, hard crowd control had no ceiling: Absolute Zero refreshes the
     * freeze every frame anything stands in its field, and duration, area and
     * cooldown are all stackable, so a build with enough of them locked the
     * whole arena in place permanently — the run stopped being a game.
     *
     * The immunity only counts down once the stun has ended, so the ratio holds
     * whatever the source: an enemy can be frozen at most
     * `1 / (1 + STUN_RECOVERY_RATIO)` of the time — a third, as it stands. Stuns
     * stay a real tool for buying space; they stop being an off switch.
     */
    stun(enemy: Enemy, seconds: number) {
        if (seconds <= 0) return;
        // Already frozen, or still shaking the last one off. A stun in progress
        // is deliberately NOT refreshable: Absolute Zero re-applies its freeze
        // every single frame anything stands in the field, so `max(current,
        // seconds)` would top the timer straight back up and the lock would
        // never end. One stun, then recovery — a rule with no way around it.
        if (enemy.stunTimer > 0 || enemy.stunImmunity > 0) return;

        enemy.stunTimer = seconds;
        enemy.stunImmunity = seconds * STUN_RECOVERY_RATIO;
    }

    /** Tick infections, corrosion and stun recovery. Stun itself counts down inside Enemy.update. */
    update(dt: number, enemies: Enemy[]) {
        for (const enemy of enemies) {
            if (enemy.isDead) continue;

            // Recovery only runs once the enemy is moving again, which is what
            // keeps the uptime ratio fixed regardless of how long the stun was
            if (enemy.stunTimer <= 0 && enemy.stunImmunity > 0) {
                enemy.stunImmunity -= dt;
            }

            const corrosion = enemy.corrosion;
            if (corrosion) {
                corrosion.timer -= dt;
                if (corrosion.timer <= 0) enemy.corrosion = null;
            }

            const infection = enemy.infection;
            if (!infection) continue;

            infection.timer -= dt;
            infection.tick -= dt;
            if (infection.tick <= 0) {
                infection.tick = TICK;
                damageSystem.dealDamage({
                    baseDamage: infection.dps * TICK,
                    source: infection.source,
                    target: enemy,
                    position: enemy.pos,
                    // A share of the target's own health is already the right
                    // size; might and crit on top would scale it twice
                    skipModifiers: infection.flat,
                });
            }
            if (infection.timer <= 0) enemy.infection = null;
        }
    }

    /**
     * Carrier died: a contagious infection bursts onto its neighbours.
     * Call from the death handler, before the enemy leaves the list.
     */
    onEnemyDeath(enemy: Enemy) {
        const infection = enemy.infection;
        enemy.infection = null;
        if (!infection?.contagious) return;
        if (infection.generation >= MAX_GENERATIONS) return;

        particles.emitSporeBurst(enemy.pos.x, enemy.pos.y, infection.spreadRadius);

        let spread = 0;
        for (const other of levelSpatialHash.getNearby(enemy.pos, infection.spreadRadius)) {
            if (other === enemy || other.isDead || spread >= 4) continue;
            if (distance(enemy.pos, other.pos) > infection.spreadRadius) continue;
            spread++;
            this.infect(other, {
                // Each jump is a little weaker, so a chain fades instead of
                // growing without bound
                dps: infection.dps * 0.85,
                flat: infection.flat,
                duration: infection.timer > 0 ? Math.max(2, infection.timer) : 3,
                source: infection.source,
                contagious: true,
                spreadRadius: infection.spreadRadius,
                generation: infection.generation + 1,
                kind: infection.kind,
            });
        }
    }

    /** Wipe every effect (new run) */
    clear(enemies: Enemy[]) {
        for (const enemy of enemies) {
            enemy.infection = null;
            enemy.corrosion = null;
            enemy.stunTimer = 0;
            enemy.stunImmunity = 0;
        }
    }
}

export const status = new StatusSystem();
