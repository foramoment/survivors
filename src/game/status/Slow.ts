/**
 * SLOW - Movement speed reduction effect
 * 
 * Reduces enemy speed multiplier each frame.
 */
import { StatusEffect } from './StatusEffect';
import type { Enemy } from '../entities/Enemy';

export class Slow extends StatusEffect {
    slowAmount: number;

    constructor(duration: number, amount: number) {
        super(duration, null);
        this.slowAmount = amount;
    }

    update(dt: number, target: Enemy) {
        this.duration -= dt;
        target.speedMultiplier = Math.min(target.speedMultiplier, 1 - this.slowAmount);
    }
}
