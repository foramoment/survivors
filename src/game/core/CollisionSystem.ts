/**
 * COLLISION SYSTEM
 * Centralized collision detection using SpatialHashGrid for O(1) broad phase.
 * 
 * Features:
 * - Uses existing levelSpatialHash for enemies
 * - Delegates hit handling to projectiles (encapsulation)
 * - Emits events for side effects (particles, damage numbers)
 */
import { Entity } from '../Entity';
import { Projectile } from '../weapons/base/Projectile';
import { Zone } from '../weapons/base/Zone';
import { levelSpatialHash } from './SpatialHash';
import { damageSystem } from './DamageSystem';
import { events } from './EventBus';

// ============================================
// COLLISION HELPERS
// ============================================

/**
 * Check if two entities are colliding (circle-circle collision)
 */
export function checkCollision(a: Entity, b: Entity): boolean {
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    const distSq = dx * dx + dy * dy;
    const radiiSum = a.radius + b.radius;
    return distSq < radiiSum * radiiSum;
}

// ============================================
// COLLISION SYSTEM
// ============================================

export class CollisionSystem {
    /**
     * Process all projectile-enemy collisions
     * @param projectiles All active projectiles and zones
     * @param enemies All active enemies (already in levelSpatialHash)
     */
    processProjectileCollisions(projectiles: (Projectile | Zone)[]): void {
        for (const p of projectiles) {
            if (p instanceof Projectile) {
                this.processProjectile(p);
            } else if (p instanceof Zone) {
                this.processZone(p);
            }
        }
    }

    /**
     * Process a single projectile's collisions
     */
    private processProjectile(projectile: Projectile): void {
        if (!projectile.canCollide || projectile.isDead) return;

        // Broad phase: O(1) lookup using SpatialHash
        const searchRadius = projectile.radius + 50;
        const nearbyEnemies = levelSpatialHash.getNearby(projectile.pos, searchRadius);

        for (const enemy of nearbyEnemies) {
            if (checkCollision(projectile, enemy)) {
                // Delegate hit handling to the projectile itself
                const hitResult = projectile.handleHit(enemy);

                // Emit event for side effects
                events.emit({
                    type: 'PROJECTILE_HIT',
                    projectile,
                    enemy
                });

                // Apply damage via DamageSystem
                if (hitResult.damage > 0) {
                    damageSystem.dealDamage({
                        baseDamage: hitResult.damage,
                        source: projectile.source,
                        target: enemy,
                        position: enemy.pos
                    });
                }

                // Check if projectile should stop (e.g., BouncingProjectile hit same enemy)
                if (!hitResult.continueChecking) {
                    break;
                }
            }
        }
    }

    /**
     * Process a single zone's collisions
     */
    private processZone(zone: Zone): void {
        if (zone.isDead) return;

        // Broad phase
        const nearbyEnemies = levelSpatialHash.getNearby(zone.pos, zone.radius);

        for (const enemy of nearbyEnemies) {
            if (checkCollision(zone, enemy)) {
                // Apply slow effect
                zone.onOverlap(enemy);

                // Apply damage on tick
                if (zone.timer >= zone.interval) {
                    damageSystem.dealDamage({
                        baseDamage: zone.damage,
                        source: zone.source,
                        target: enemy,
                        position: enemy.pos
                    });
                }
            }
        }

        // Reset zone timer if ticked
        if (zone.timer >= zone.interval) {
            zone.timer = 0;
        }
    }
}

// ============================================
// HIT RESULT TYPE
// ============================================

/**
 * Result of a projectile hit, used for polymorphic behavior
 */
export interface HitResult {
    /** Damage to apply (0 if already handled) */
    damage: number;
    /** Whether to continue checking other enemies */
    continueChecking: boolean;
}

// Singleton instance
export const collisionSystem = new CollisionSystem();
