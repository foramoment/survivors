/**
 * CRYSTAL FIELD — every XP crystal lying on the arena floor.
 *
 * XP crystals never expire. Clearing a pack, kiting out and coming back for the
 * drops is the loop the game is built on, and a 30s timer punished exactly
 * that. The cost of keeping them is bounded by the two rules below rather than
 * by deleting them, so nothing the player earned is ever quietly thrown away.
 */
import { XPCrystal } from './XPCrystal';
import type { Player } from './Player';
import { checkCollision, distance, type Vector2 } from '../../engine/Utils';
import { audio } from '../../engine/AudioSystem';

/**
 * Anything on the field that gathers loose crystals — today, the singularity
 * and the black hole it collapses into.
 *
 * Duck-typed rather than an `instanceof` list: GameManager keeps one entity
 * array and asks each entity what it can do, the same way `layer` decides how
 * it draws. A weapon that wants to hoover crystals declares `crystalPull` and
 * nothing else in the game has to learn its name.
 */
export interface CrystalAttractor {
    pos: Vector2;
    /** Radius it gathers within. 0 means it does not gather. */
    crystalPull: number;
}

/** How fast an attractor drags a crystal, px/s */
const GATHER_SPEED = 300;
/** Crystals settle into a small heap rather than stacking on one pixel */
const HEAP_RADIUS = 16;

/**
 * Margin beyond the viewport within which a crystal still ticks and draws.
 * Nothing but the magnet moves a crystal, and nobody can see one off screen
 * bob, so the rest are skipped entirely.
 */
const ACTIVE_MARGIN = 120;

/** Above this many crystals, the distant ones start merging */
const SOFT_CAP = 900;
/** Crystals nearer than this to the player are never rearranged */
const MERGE_DISTANCE = 1400;
/** Grid cell that distant crystals collapse into */
const MERGE_CELL = 190;
/** Seconds between merge passes */
const MERGE_INTERVAL = 1;

export class CrystalField {
    private crystals: XPCrystal[] = [];
    private mergeTimer: number = MERGE_INTERVAL;

    get count(): number {
        return this.crystals.length;
    }

    clear() {
        this.crystals = [];
        this.mergeTimer = MERGE_INTERVAL;
    }

    spawn(x: number, y: number, value: number) {
        this.crystals.push(new XPCrystal(x, y, value));
    }

    update(dt: number, player: Player, viewWidth: number, viewHeight: number, attractors: CrystalAttractor[] = []) {
        const magnet = player.stats.magnet;
        const halfW = viewWidth / 2 + ACTIVE_MARGIN;
        const halfH = viewHeight / 2 + ACTIVE_MARGIN;
        const px = player.pos.x;
        const py = player.pos.y;

        for (let i = this.crystals.length - 1; i >= 0; i--) {
            const crystal = this.crystals[i];
            if (Math.abs(crystal.pos.x - px) > halfW || Math.abs(crystal.pos.y - py) > halfH) continue;

            crystal.update(dt, player.pos, magnet);
            if (attractors.length > 0) this.gather(crystal, attractors, player.pos, magnet, dt);

            if (checkCollision(crystal, player)) {
                player.gainXp(crystal.value);
                audio.play('pickup');
                this.crystals.splice(i, 1);
            }
        }

        this.mergeTimer -= dt;
        if (this.mergeTimer <= 0) {
            this.mergeTimer = MERGE_INTERVAL;
            this.consolidate(px, py);
        }
    }

    /**
     * Drag one crystal toward whichever attractor has hold of it.
     *
     * Two rules keep this from ever costing the player anything:
     *
     *  - **The magnet wins.** A crystal already inside the player's magnet is
     *    his, and the hole does not get to tow it back out. Otherwise a hole
     *    dropped at your feet would fight you for your own pickups.
     *  - **They heap, they do not vanish.** Crystals stop short of the centre
     *    so the pile reads as a pile, and since nothing crosses a black hole's
     *    horizon, the heap lands in the one part of the field that is safe to
     *    stand in. Killing the crowd and then walking in to collect what it
     *    dropped is the whole loop the class is built around.
     */
    private gather(crystal: XPCrystal, attractors: CrystalAttractor[], playerPos: Vector2, magnet: number, dt: number) {
        if (distance(crystal.pos, playerPos) < magnet) return;

        for (const attractor of attractors) {
            const dist = distance(crystal.pos, attractor.pos);
            if (dist > attractor.crystalPull || dist < HEAP_RADIUS) continue;

            const step = Math.min(GATHER_SPEED * dt, dist - HEAP_RADIUS);
            crystal.pos.x += ((attractor.pos.x - crystal.pos.x) / dist) * step;
            crystal.pos.y += ((attractor.pos.y - crystal.pos.y) / dist) * step;
            return;
        }
    }

    /**
     * Same screen-bounds cull as the update: drawing is the expensive part, and
     * a run can leave thousands of crystals lying around the arena.
     */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2, viewWidth: number, viewHeight: number) {
        const cullW = viewWidth + ACTIVE_MARGIN;
        const cullH = viewHeight + ACTIVE_MARGIN;
        for (const crystal of this.crystals) {
            const sx = crystal.pos.x - camera.x;
            const sy = crystal.pos.y - camera.y;
            if (sx < -ACTIVE_MARGIN || sy < -ACTIVE_MARGIN || sx > cullW || sy > cullH) continue;
            crystal.draw(ctx, camera);
        }
    }

    /**
     * Safety valve for a very long run: once the field is crowded, distant
     * crystals are merged cell by cell into one bigger crystal carrying the
     * combined XP. Nothing is lost, and the array cannot grow without bound.
     * Only crystals well away from the player are touched, so this never
     * rearranges anything you are looking at.
     */
    private consolidate(px: number, py: number) {
        if (this.crystals.length <= SOFT_CAP) return;

        const buckets = new Map<string, XPCrystal>();
        const kept: XPCrystal[] = [];

        for (const crystal of this.crystals) {
            const dx = crystal.pos.x - px;
            const dy = crystal.pos.y - py;
            if (dx * dx + dy * dy < MERGE_DISTANCE * MERGE_DISTANCE) {
                kept.push(crystal);
                continue;
            }

            const key = `${Math.floor(crystal.pos.x / MERGE_CELL)}:${Math.floor(crystal.pos.y / MERGE_CELL)}`;
            const existing = buckets.get(key);
            if (existing) {
                existing.setValue(existing.value + crystal.value);
            } else {
                buckets.set(key, crystal);
                kept.push(crystal);
            }
        }

        this.crystals = kept;
    }
}
