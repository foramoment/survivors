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
import { levelSpatialHash } from './SpatialHash';
import { particles } from './ParticleSystem';
import { distance } from './Utils';
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

/** Purely cosmetic — picks the colour of the orbiting motes on the enemy */
export type InfectionKind = 'spore' | 'acid' | 'burn';

export interface Infection {
    /** Base damage per second (goes through DamageSystem, so might/crit apply) */
    dps: number;
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
    /** Apply (or refresh) an infection. The stronger dps and longer timer win. */
    infect(enemy: Enemy, params: InfectParams) {
        const current = enemy.infection;
        if (current) {
            current.dps = Math.max(current.dps, params.dps);
            current.timer = Math.max(current.timer, params.duration);
            current.contagious = current.contagious || !!params.contagious;
            current.spreadRadius = Math.max(current.spreadRadius, params.spreadRadius ?? 0);
            current.generation = Math.min(current.generation, params.generation ?? 0);
            current.kind = params.kind ?? current.kind;
            current.source = params.source;
            return;
        }
        enemy.infection = {
            dps: params.dps,
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
