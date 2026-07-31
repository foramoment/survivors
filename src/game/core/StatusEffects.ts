/**
 * StatusEffects — debuffs that live on an enemy instead of on a zone.
 *
 * Zones only hurt what is standing inside them; a status keeps working after
 * the enemy walks out, which is what makes fungal/psionic weapons feel
 * different from "another circle of damage".
 *
 * Two effects so far:
 *   infection — damage over time. Can be *contagious*: when a carrier dies it
 *               bursts and infects everything nearby, so a fungal build snowballs
 *               through a crowd. Spread generations are capped so one cloud
 *               cannot chain across the entire arena forever.
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
    source: any;
}

export interface InfectParams {
    dps: number;
    duration: number;
    source: any;
    contagious?: boolean;
    spreadRadius?: number;
    generation?: number;
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
            source: params.source,
        };
    }

    /** Freeze an enemy in place for `seconds` (longest wins) */
    stun(enemy: Enemy, seconds: number) {
        enemy.stunTimer = Math.max(enemy.stunTimer, seconds);
    }

    /** Tick every active infection. Stun counts down inside Enemy.update. */
    update(dt: number, enemies: Enemy[]) {
        for (const enemy of enemies) {
            const infection = enemy.infection;
            if (!infection || enemy.isDead) continue;

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
            });
        }
    }

    /** Wipe every effect (new run) */
    clear(enemies: Enemy[]) {
        for (const enemy of enemies) {
            enemy.infection = null;
            enemy.stunTimer = 0;
        }
    }
}

export const status = new StatusSystem();
