/**
 * PropField — the arena's obstacles: rocks, cargo crates, void shards.
 *
 * The arena is endless, so props are generated per 520×520 world *chunk* from
 * a seed of (stage theme, chunk coords). The same chunk always produces the
 * same props, which means nothing has to be stored, saved or streamed — a
 * chunk can be dropped and rebuilt identically when the player walks back.
 *
 * Props are the one part of the level-depth work that touches gameplay:
 * `resolve()` pushes entities out of them, so the player has to steer around
 * cover and enemies have to flow around it (they slide along the surface
 * toward the player instead of grinding into it).
 *
 * A safe circle around the world origin is always kept clear so a run never
 * starts inside a rock.
 */

import { STAGES, type StageConfig, type StageProps } from '../data/StageData';
import { sprites } from './SpriteFactory';
import type { Vector2 } from './Utils';

const CHUNK = 520;
/** Nothing spawns within this radius of the world origin (player start) */
const SAFE_RADIUS = 300;
/** Chunks further than this (in chunk units) from the player are dropped */
const KEEP_RANGE = 4;

export interface Prop {
    x: number;
    y: number;
    /** Collision radius */
    radius: number;
    variant: number;
    /** Draw size multiplier — sprites overhang their collision circle a little */
    scale: number;
}

function hashChunk(seed: number, cx: number, cy: number): number {
    let h = seed ^ Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cy | 0, 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2545f491);
    h ^= h >>> 13;
    return h >>> 0;
}

function hashString(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class PropField {
    private config: StageProps = STAGES[0].props;
    private hue: number = STAGES[0].visuals.floorHue;
    private seed: number = hashString(STAGES[0].theme);
    private chunks: Map<string, Prop[]> = new Map();
    /** Reused by the per-entity queries (see `collect`) */
    private scratch: Prop[] = [];

    setStage(stage: StageConfig) {
        this.config = stage.props;
        this.hue = stage.visuals.floorHue;
        this.seed = hashString(stage.theme);
        this.chunks.clear();
    }

    /** Drop every generated chunk (new run on the same stage) */
    reset() {
        this.chunks.clear();
    }

    // =========================================================
    // Generation
    // =========================================================

    private chunkAt(cx: number, cy: number): Prop[] {
        const key = `${cx},${cy}`;
        let props = this.chunks.get(key);
        if (props) return props;

        props = [];
        const cfg = this.config;
        if (cfg.density > 0) {
            const rng = mulberry32(hashChunk(this.seed, cx, cy));
            // Fractional density: 1.4 = one guaranteed prop plus a 40% second
            const count = Math.floor(cfg.density) + (rng() < cfg.density % 1 ? 1 : 0);
            for (let i = 0; i < count; i++) {
                const radius = cfg.minRadius + rng() * (cfg.maxRadius - cfg.minRadius);
                const x = cx * CHUNK + radius + rng() * (CHUNK - radius * 2);
                const y = cy * CHUNK + radius + rng() * (CHUNK - radius * 2);
                // Keep the spawn area clear
                if (Math.hypot(x, y) < SAFE_RADIUS + radius) continue;
                props.push({
                    x,
                    y,
                    radius,
                    variant: Math.floor(rng() * 4),
                    scale: 2.35 + rng() * 0.25,
                });
            }
        }
        this.chunks.set(key, props);
        return props;
    }

    /** Generate/evict chunks around the player; call once per frame */
    update(center: Vector2) {
        const pcx = Math.floor(center.x / CHUNK);
        const pcy = Math.floor(center.y / CHUNK);
        for (let cy = pcy - 2; cy <= pcy + 2; cy++) {
            for (let cx = pcx - 2; cx <= pcx + 2; cx++) this.chunkAt(cx, cy);
        }

        if (this.chunks.size > 120) {
            for (const key of this.chunks.keys()) {
                const [cx, cy] = key.split(',').map(Number);
                if (Math.abs(cx - pcx) > KEEP_RANGE || Math.abs(cy - pcy) > KEEP_RANGE) {
                    this.chunks.delete(key);
                }
            }
        }
    }

    // =========================================================
    // Queries
    // =========================================================

    /** Every prop whose chunk touches the box around `pos` */
    getNearby(pos: Vector2, radius: number): Prop[] {
        return this.collect(pos, radius, []);
    }

    /**
     * Same as `getNearby` but fills a caller-owned array. Every enemy queries
     * the field each frame, so the hot paths reuse one scratch array instead of
     * allocating a few hundred per frame.
     */
    private collect(pos: Vector2, radius: number, result: Prop[]): Prop[] {
        result.length = 0;
        const minX = Math.floor((pos.x - radius) / CHUNK);
        const maxX = Math.floor((pos.x + radius) / CHUNK);
        const minY = Math.floor((pos.y - radius) / CHUNK);
        const maxY = Math.floor((pos.y + radius) / CHUNK);
        for (let cy = minY; cy <= maxY; cy++) {
            for (let cx = minX; cx <= maxX; cx++) {
                for (const prop of this.chunkAt(cx, cy)) result.push(prop);
            }
        }
        return result;
    }

    /** True if a circle at `pos` would overlap an obstacle (used by spawning) */
    isBlocked(pos: Vector2, radius: number): boolean {
        for (const prop of this.collect(pos, radius + this.config.maxRadius, this.scratch)) {
            const dx = pos.x - prop.x;
            const dy = pos.y - prop.y;
            const min = prop.radius + radius;
            if (dx * dx + dy * dy < min * min) return true;
        }
        return false;
    }

    /**
     * Push an entity out of any obstacle it ended up inside.
     *
     * With `slideToward`, the entity also slides along the surface toward that
     * point — without it, enemies pile up on the far side of a rock instead of
     * walking around it. Returns true if anything was corrected.
     */
    resolve(
        entity: { pos: Vector2; radius: number },
        slideToward?: Vector2,
        slideSpeed: number = 0,
        dt: number = 0
    ): boolean {
        let moved = false;
        const props = this.collect(entity.pos, entity.radius + this.config.maxRadius, this.scratch);
        for (const prop of props) {
            const dx = entity.pos.x - prop.x;
            const dy = entity.pos.y - prop.y;
            const min = prop.radius + entity.radius;
            const distSq = dx * dx + dy * dy;
            if (distSq >= min * min) continue;

            const dist = Math.sqrt(distSq);
            // Dead centre: pick an arbitrary but stable direction
            const nx = dist > 0.001 ? dx / dist : 1;
            const ny = dist > 0.001 ? dy / dist : 0;
            entity.pos.x = prop.x + nx * min;
            entity.pos.y = prop.y + ny * min;
            moved = true;

            if (slideToward && slideSpeed > 0 && dt > 0) {
                // Tangent, oriented toward the target so the slide makes progress
                const tx = -ny;
                const ty = nx;
                const dir = Math.sign((slideToward.x - entity.pos.x) * tx + (slideToward.y - entity.pos.y) * ty) || 1;
                entity.pos.x += tx * dir * slideSpeed * dt;
                entity.pos.y += ty * dir * slideSpeed * dt;
            }
        }
        return moved;
    }

    // =========================================================
    // Rendering
    // =========================================================

    /** Draw every prop on screen — call after the background, before entities */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2, width: number, height: number) {
        if (this.config.density <= 0) return;
        const centre = { x: camera.x + width / 2, y: camera.y + height / 2 };
        const reach = Math.hypot(width, height) / 2 + this.config.maxRadius * 3;
        const props = this.getNearby(centre, reach);
        if (props.length === 0) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.shadowBlur = 0;

        for (const prop of props) {
            const x = prop.x - camera.x;
            const y = prop.y - camera.y;
            const size = prop.radius * prop.scale;
            if (x < -size || y < -size || x > width + size || y > height + size) continue;

            // Contact shadow grounds the prop on the floor plate
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(x, y + prop.radius * 0.45, prop.radius * 1.05, prop.radius * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1;
            const sprite = sprites.getPropSprite(this.config.style, prop.variant, this.hue);
            ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
        }

        ctx.restore();
    }
}

export const propField = new PropField();
