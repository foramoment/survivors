import { Entity } from './Entity';
import { type Vector2 } from './core/Utils';

export abstract class Weapon {
    owner: Entity;
    cooldown: number = 0;
    level: number = 1;

    // Stats
    abstract name: string;
    abstract emoji: string;
    abstract description: string;

    baseCooldown: number = 1;
    damage: number = 10;
    area: number = 100;
    speed: number = 300;
    duration: number = 1;

    onSpawn: (entity: Entity) => void = () => { };

    constructor(owner: Entity) {
        this.owner = owner;
    }

    abstract update(dt: number, enemies: Entity[]): void;
    abstract draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;

    // For upgrades
    abstract upgrade(): void;
}
