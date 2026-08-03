import type { Vector2 } from './Utils';

/**
 * Which pass draws an entity.
 *
 * `ground` goes under the crystals, the enemies and the player — that is where
 * anything lying on the floor belongs. `air` goes over all of them.
 *
 * This replaced an `instanceof Projectile` / `instanceof Zone` split in the
 * renderer, which had a nasty property: an entity that was neither was drawn by
 * no pass at all, and `GameManager.spawnEntity` dropped it outright. Blood
 * Cleaver's swing arc shipped that way — dealing full damage while being
 * completely invisible. A field every entity has cannot fail to match.
 */
export type DrawLayer = 'ground' | 'air';

export abstract class Entity {
    pos: Vector2;
    radius: number;
    isDead: boolean = false;
    layer: DrawLayer = 'air';

    constructor(x: number, y: number, radius: number) {
        this.pos = { x, y };
        this.radius = radius;
    }

    abstract update(dt: number, data?: any): void;
    abstract draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;
}
