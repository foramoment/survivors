import { Entity } from './Entity';
import type { Player } from './entities/Player';
import { type Vector2, distance, normalize } from './core/Utils';
import { levelSpatialHash } from './core/SpatialHash';

/**
 * WEAPON BASE CLASS
 * 
 * Provides common functionality for all weapons:
 * - Stats management (damage, area, cooldown, speed, duration)
 * - Default upgrade() with scaling (can be overridden)
 * - Callbacks for spawning entities and damage numbers
 */
export abstract class Weapon {
    owner: Player;
    cooldown: number = 0;
    level: number = 1;
    evolved: boolean = false;

    // Required stats
    abstract name: string;
    abstract emoji: string;
    abstract description: string;

    // Combat stats
    baseCooldown: number = 1;
    damage: number = 10;
    area: number = 100;
    speed: number = 300;
    duration: number = 1;

    protected damageScaling: number = 1.2;

    // Callbacks
    onSpawn: (entity: Entity) => void = () => { };

    constructor(owner: Player) {
        this.owner = owner;
    }

    abstract update(dt: number): void;

    /**
     * Default upgrade implementation.
     * Increments level and applies scaling factors.
     * Override in subclass for custom upgrade behavior.
     */
    upgrade(): void {
        this.level++;
        this.evolved = this.level >= 6;
        this.damage *= this.damageScaling;
    }

    // ============================================
    // TARGETING METHODS
    // ============================================

    /**
     * Base method for finding enemies. All targeting methods use this.
     * @param options.maxRange Search radius (defaults to this.area)
     * @param options.mode 'closest' or 'random'
     * @param options.count Max enemies to return
     */
    protected findEnemies(options: { maxRange?: number; mode?: 'closest' | 'random'; count?: number } = {}): Entity[] {
        const { maxRange, mode = 'closest', count = 1 } = options;
        // Apply stats.area multiplier only when using default this.area
        const searchRadius = maxRange !== undefined
            ? maxRange
            : this.area * this.owner.stats.area;
        const nearby = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

        if (nearby.length === 0) return [];

        if (mode === 'random') {
            // Shuffle and take count
            const shuffled = [...nearby].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, Math.min(count, shuffled.length));
        }

        // mode === 'closest' - sort by distance and take count
        const sorted = [...nearby].sort((a, b) => {
            const distA = distance(this.owner.pos, a.pos);
            const distB = distance(this.owner.pos, b.pos);
            return distA - distB;
        });
        return sorted.slice(0, Math.min(count, sorted.length));
    }

    /**
     * Find the closest enemy within range.
     */
    protected findClosestEnemy(maxRange?: number): Entity | null {
        const result = this.findEnemies({ maxRange, mode: 'closest', count: 1 });
        return result[0] ?? null;
    }

    /**
     * Find random enemies within range.
     * @param count Number of enemies to return
     * @param maxRange Search radius (defaults to this.area)
     */
    protected findRandomEnemies(count: number = 1, maxRange?: number): Entity[] {
        return this.findEnemies({ maxRange, mode: 'random', count });
    }

    /**
     * Find all enemies within range.
     */
    protected findAllEnemies(maxRange?: number): Entity[] {
        return this.findEnemies({ maxRange, count: Infinity });
    }

    /**
     * The spot inside `maxRange` covered by the most enemies.
     *
     * Weapons that drop something on the ground used to either pick a random
     * offset (Frost Nova) or the single closest enemy (Acid Pool). Both waste
     * an area effect: a puddle is worth throwing where the pack is, not where
     * one straggler happens to stand.
     *
     * Candidates are enemy positions rather than a grid — the best cluster
     * centre is always near a body — and the candidate list is capped so this
     * stays O(candidates x neighbours) no matter how many enemies are alive.
     */
    protected findDensestSpot(maxRange: number, clusterRadius: number): Vector2 | null {
        const nearby = levelSpatialHash.getWithinRadius(this.owner.pos, maxRange);
        if (nearby.length === 0) return null;

        const MAX_CANDIDATES = 12;
        const step = Math.max(1, Math.floor(nearby.length / MAX_CANDIDATES));

        let best: Entity | null = null;
        let bestScore = -1;
        for (let i = 0; i < nearby.length; i += step) {
            const candidate = nearby[i];
            let score = 0;
            for (const other of levelSpatialHash.getWithinRadius(candidate.pos, clusterRadius)) {
                if (distance(candidate.pos, other.pos) <= clusterRadius) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                best = candidate;
            }
        }

        return best ? { x: best.pos.x, y: best.pos.y } : null;
    }

    /** How many enemies are pressed within `radius` of the player */
    protected countEnemiesAround(radius: number): number {
        let count = 0;
        for (const enemy of levelSpatialHash.getWithinRadius(this.owner.pos, radius)) {
            if (distance(this.owner.pos, enemy.pos) <= radius) count++;
        }
        return count;
    }

    // ============================================
    // VELOCITY CALCULATION
    // ============================================

    /**
     * Calculate velocity vector toward a target.
     * Uses player's stats.speed multiplier.
     */
    protected calculateVelocityToTarget(target: Entity): Vector2 {
        const dir = normalize({
            x: target.pos.x - this.owner.pos.x,
            y: target.pos.y - this.owner.pos.y
        });
        const speed = this.speed * this.owner.stats.speed;
        return { x: dir.x * speed, y: dir.y * speed };
    }
}
