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
import { checkCollision, type Vector2 } from '../core/Utils';
import { audio } from '../core/AudioSystem';

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

    update(dt: number, player: Player, viewWidth: number, viewHeight: number) {
        const magnet = player.stats.magnet;
        const halfW = viewWidth / 2 + ACTIVE_MARGIN;
        const halfH = viewHeight / 2 + ACTIVE_MARGIN;
        const px = player.pos.x;
        const py = player.pos.y;

        for (let i = this.crystals.length - 1; i >= 0; i--) {
            const crystal = this.crystals[i];
            if (Math.abs(crystal.pos.x - px) > halfW || Math.abs(crystal.pos.y - py) > halfH) continue;

            crystal.update(dt, player.pos, magnet);

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
