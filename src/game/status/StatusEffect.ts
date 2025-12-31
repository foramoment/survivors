/**
 * STATUS EFFECT - Base class for all status effects
 * 
 * Effects can modify enemy stats, deal damage over time, etc.
 * Each effect manages its own behavior in update().
 */
import type { Enemy } from '../entities/Enemy';
import type { Weapon } from '../Weapon';

export abstract class StatusEffect {
    duration: number;
    source: Weapon | null;

    constructor(duration: number, source: Weapon | null = null) {
        this.duration = duration;
        this.source = source;
    }

    abstract update(dt: number, target: Enemy): void;

    onApply?(target: Enemy): void;
    onRemove?(target: Enemy): void;
}
