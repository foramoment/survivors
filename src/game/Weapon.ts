import { Entity } from './Entity';
import { type Vector2 } from './core/Utils';

/**
 * WEAPON BASE CLASS
 * 
 * Provides common functionality for all weapons:
 * - Stats management (damage, area, cooldown, speed, duration)
 * - Default upgrade() with scaling (can be overridden)
 * - Callbacks for spawning entities and damage numbers
 */
export abstract class Weapon {
    owner: Entity;
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
    onDamage: (pos: Vector2, amount: number, isCrit?: boolean) => void = () => { };

    constructor(owner: Entity) {
        this.owner = owner;
    }

    abstract update(dt: number): void;
    abstract draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;

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
}
