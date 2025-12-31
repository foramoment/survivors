/**
 * STUN - Complete movement stop effect
 * 
 * Sets enemy speed to 0 for the duration.
 */
import { StatusEffect } from './StatusEffect';
import type { Enemy } from '../entities/Enemy';

export class Stun extends StatusEffect {
    constructor(duration: number) {
        super(duration, null);
    }

    update(dt: number, target: Enemy) {
        this.duration -= dt;
        target.speedMultiplier = 0;
    }
}
