import type { Vector2 } from './core/Utils';

export abstract class Entity {
    pos: Vector2;
    radius: number;
    isDead: boolean = false;

    constructor(x: number, y: number, radius: number) {
        this.pos = { x, y };
        this.radius = radius;
    }

    abstract update(dt: number, data?: any): void;
    abstract draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;
}
