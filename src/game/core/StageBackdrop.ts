/**
 * StageBackdrop — the arena equivalent of `ui/MenuBackdrop`: what used to be a
 * single repeating floor tile is now four depth layers plus stage lighting.
 *
 *   far   (0.22×)  baked nebula + star tile, scrolls slowly against the camera
 *   stars (0.22×)  a handful of live twinklers on top of the baked ones
 *   floor (1.00×)  the procedural plate tile — now punched with transparent
 *                  seams so the layers behind it stay visible
 *   near  (1.45×)  dust and debris drifting past in front of the action
 *
 * On top of everything sits `drawLighting()`: a coloured wash + vignette from
 * the stage palette, with a broken-lamp flicker for the station and a slow
 * breathing pulse for the nexus.
 *
 * Cost per frame is two pattern fillRects, ~200 tiny fillRects and (in the
 * lighting pass) three cached gradients — no per-frame allocation, no
 * shadowBlur, nothing recomputed that can be baked.
 */

import { STAGES, type StageConfig, type StageVisuals } from '../data/StageData';
import { sprites } from './SpriteFactory';
import { juice } from '../../engine/JuiceSystem';
import type { Vector2 } from '../../engine/Utils';

const FAR_PARALLAX = 0.22;
const NEAR_PARALLAX = 1.45;
const FAR_TILE = 512;

interface Star {
    x: number;
    y: number;
    size: number;
    phase: number;
}

interface Mote {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    /** Big chunks get a second block offset so they read as debris, not dust */
    chunk: boolean;
}

/** Deterministic string hash (FNV-1a) — same one SpriteFactory seeds with */
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

/**
 * Failing fluorescent lamp: mostly steady with a fast tremble, plus rare
 * dropouts where the tube cuts out for a beat. Deterministic, no allocation.
 */
function lampFlicker(t: number): number {
    const tremble =
        Math.sin(t * 13.1) * 0.5 +
        Math.sin(t * 7.7) * 0.3 +
        Math.sin(t * 31.3) * 0.2;
    const dropout = Math.sin(t * 0.9) * Math.sin(t * 2.37);
    const base = 1 + tremble * 0.22;
    return dropout > 0.86 ? base * 0.2 : base;
}

function mod(value: number, m: number): number {
    return ((value % m) + m) % m;
}

export class StageBackdrop {
    private visuals: StageVisuals = STAGES[0].visuals;
    private theme: string = STAGES[0].theme;

    private farTile: HTMLCanvasElement | null = null;
    private farPattern: CanvasPattern | null = null;
    private floorPattern: CanvasPattern | null = null;
    private patternTheme: string = '';

    private stars: Star[] = [];
    private motes: Mote[] = [];
    private wrapX = 0;
    private wrapY = 0;
    private width = 0;
    private height = 0;

    private time = 0;
    private lastCam: Vector2 | null = null;

    /**
     * 0 = lights on, 1 = pitch black. Driven by the station's power-failure
     * arena event; it kills the colour wash and drops a darkness layer.
     */
    blackout = 0;

    // Cached lighting gradients (rebuilt on resize / stage change)
    private gradientKey = '';
    private edgeGradient: CanvasGradient | null = null;
    private beaconLeft: CanvasGradient | null = null;
    private beaconRight: CanvasGradient | null = null;
    private darkGradient: CanvasGradient | null = null;

    setStage(stage: StageConfig) {
        if (this.theme === stage.theme) return;
        this.theme = stage.theme;
        this.visuals = stage.visuals;
        this.farTile = null;
        this.farPattern = null;
        this.floorPattern = null;
        this.patternTheme = '';
        this.gradientKey = '';
        this.stars.length = 0;
        this.motes.length = 0;
        this.lastCam = null;
    }

    // =========================================================
    // Layout / baking
    // =========================================================

    private ensureLayout(width: number, height: number) {
        if (this.width === width && this.height === height && this.stars.length) return;
        this.width = width;
        this.height = height;
        // Wrap larger than the screen: every star maps to exactly one position,
        // so no star needs to be drawn more than once.
        this.wrapX = width + 320;
        this.wrapY = height + 320;
        this.gradientKey = '';

        const rng = mulberry32(hashString(this.theme) ^ 0x5eed);

        const starCount = Math.min(160, Math.round((this.wrapX * this.wrapY) / 14000));
        this.stars = Array.from({ length: starCount }, () => ({
            x: rng() * this.wrapX,
            y: rng() * this.wrapY,
            size: rng() < 0.22 ? 3 : 2,
            phase: rng() * Math.PI * 2,
        }));

        const moteCount = Math.min(90, Math.round((width * height) / 22000));
        this.motes = Array.from({ length: moteCount }, (_, i) => this.makeMote(rng, i % 7 === 0));
    }

    private makeMote(rng: () => number, chunk: boolean): Mote {
        return {
            x: rng() * (this.width + 120) - 60,
            y: rng() * (this.height + 120) - 60,
            vx: (rng() - 0.5) * 34 - 12,
            vy: (rng() - 0.5) * 22 + 6,
            size: chunk ? 4 + Math.floor(rng() * 3) * 2 : 2,
            alpha: chunk ? 0.20 + rng() * 0.2 : 0.14 + rng() * 0.26,
            chunk,
        };
    }

    /** Nebula haze + dim stars, baked once per stage into a tileable canvas */
    private buildFarTile(): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = FAR_TILE;
        canvas.height = FAR_TILE;
        const ctx = canvas.getContext('2d')!;
        const rng = mulberry32(hashString(this.theme));

        // Blobs are drawn nine times (3×3 wrap) so the tile seams disappear
        const blobs = [
            { x: 0.28, y: 0.32, r: 0.42, color: this.visuals.nebula[0] },
            { x: 0.74, y: 0.66, r: 0.38, color: this.visuals.nebula[1] },
            { x: 0.52, y: 0.12, r: 0.30, color: this.visuals.nebula[1] },
        ];
        for (const b of blobs) {
            const r = b.r * FAR_TILE;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const cx = b.x * FAR_TILE + ox * FAR_TILE;
                    const cy = b.y * FAR_TILE + oy * FAR_TILE;
                    if (cx + r < 0 || cx - r > FAR_TILE || cy + r < 0 || cy - r > FAR_TILE) continue;
                    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                    grad.addColorStop(0, b.color);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
                }
            }
        }

        // Dim background stars — the live twinklers are drawn on top of these
        for (let i = 0; i < 260; i++) {
            const x = Math.floor(rng() * FAR_TILE);
            const y = Math.floor(rng() * FAR_TILE);
            const size = rng() < 0.18 ? 2 : 1;
            ctx.globalAlpha = 0.25 + rng() * 0.45;
            ctx.fillStyle = this.visuals.star;
            ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1;

        return canvas;
    }

    private ensurePatterns(ctx: CanvasRenderingContext2D) {
        if (this.patternTheme === this.theme && this.farPattern && this.floorPattern) return;
        this.farTile = this.farTile ?? this.buildFarTile();
        this.farPattern = ctx.createPattern(this.farTile, 'repeat');
        this.floorPattern = ctx.createPattern(
            sprites.getBackgroundTile(this.theme, this.visuals.floorHue),
            'repeat'
        );
        this.patternTheme = this.theme;
    }

    // =========================================================
    // Frame update
    // =========================================================

    update(dt: number, camera: Vector2, width: number, height: number) {
        this.ensureLayout(width, height);
        this.time += dt;

        // The near layer lives in screen space, so it only needs the *extra*
        // motion beyond the world's own 1× scroll.
        let dx = 0;
        let dy = 0;
        if (this.lastCam) {
            dx = camera.x - this.lastCam.x;
            dy = camera.y - this.lastCam.y;
            // A teleport (new run, respawn) must not fling the dust across the screen
            if (Math.abs(dx) > width || Math.abs(dy) > height) {
                dx = 0;
                dy = 0;
            }
        }
        this.lastCam = { x: camera.x, y: camera.y };

        const drift = NEAR_PARALLAX - 1;
        const padX = 60;
        const padY = 60;
        for (const m of this.motes) {
            m.x += m.vx * dt - dx * drift;
            m.y += m.vy * dt - dy * drift;
            if (m.x < -padX) m.x += width + padX * 2;
            else if (m.x > width + padX) m.x -= width + padX * 2;
            if (m.y < -padY) m.y += height + padY * 2;
            else if (m.y > height + padY) m.y -= height + padY * 2;
        }
    }

    // =========================================================
    // Rendering
    // =========================================================

    /** World layers — call inside the camera/zoom transform */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2, width: number, height: number) {
        this.ensureLayout(width, height);
        this.ensurePatterns(ctx);

        // Oversized by 12.5% so a zoom-out punch never exposes the void
        const padX = width * 0.125;
        const padY = height * 0.125;

        ctx.save();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;

        ctx.fillStyle = this.visuals.space;
        ctx.fillRect(-padX, -padY, width + padX * 2, height + padY * 2);

        // Far layer: nebula + baked stars
        if (this.farPattern) {
            const ox = camera.x * FAR_PARALLAX;
            const oy = camera.y * FAR_PARALLAX;
            ctx.save();
            ctx.translate(-ox, -oy);
            ctx.fillStyle = this.farPattern;
            ctx.fillRect(ox - padX, oy - padY, width + padX * 2, height + padY * 2);
            ctx.restore();
        }

        // Live twinklers, wrapped over a torus slightly larger than the screen
        ctx.fillStyle = this.visuals.star;
        for (const s of this.stars) {
            const x = mod(s.x - camera.x * FAR_PARALLAX, this.wrapX) - 160;
            const y = mod(s.y - camera.y * FAR_PARALLAX, this.wrapY) - 160;
            if (x < -padX || y < -padY || x > width + padX || y > height + padY) continue;
            ctx.globalAlpha = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 2.4 + s.phase));
            ctx.fillRect(x | 0, y | 0, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        // Floor plate (1×) — translucent seams let the layers above show through
        if (this.floorPattern) {
            ctx.save();
            ctx.translate(-camera.x, -camera.y);
            ctx.fillStyle = this.floorPattern;
            ctx.fillRect(camera.x - padX, camera.y - padY, width + padX * 2, height + padY * 2);
            ctx.restore();
        }

        // Near layer: dust and debris in front of the floor
        ctx.fillStyle = this.visuals.dust;
        for (const m of this.motes) {
            ctx.globalAlpha = m.alpha;
            ctx.fillRect(m.x | 0, m.y | 0, m.size, m.size);
            if (m.chunk) ctx.fillRect((m.x | 0) + m.size, (m.y | 0) - 2, m.size - 2, 2);
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    /** Stage lighting — screen space, call outside the camera transform */
    drawLighting(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const v = this.visuals;
        if (v.lightAlpha <= 0 && v.edgeAlpha <= 0) return;
        this.ensureGradients(ctx, width, height);

        // Screen FX off (Options) keeps the colour grade but drops the motion
        const animated = juice.enabled;
        const t = this.time;

        let intensity = 1;
        if (animated && v.pulse > 0) intensity *= 1 + v.pulse * 0.3 * Math.sin(t * 0.8);
        if (animated && v.flicker > 0) intensity *= 1 - v.flicker * (1 - lampFlicker(t));
        intensity = Math.max(0.15, intensity);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.shadowBlur = 0;

        const lit = 1 - this.blackout;
        if (v.lightAlpha > 0 && lit > 0) {
            ctx.globalAlpha = Math.min(0.5, v.lightAlpha * intensity) * lit;
            ctx.fillStyle = v.light;
            ctx.fillRect(0, 0, width, height);
        }

        // Rotating emergency beacons on stages with failing power — during a
        // blackout they are the only light left, so they burn brighter.
        if (animated && (v.flicker > 0.5 || this.blackout > 0) && this.beaconLeft && this.beaconRight) {
            const speed = this.blackout > 0 ? 2.6 : 1.5;
            const strength = 0.5 + this.blackout * 0.5;
            const strobe = (phase: number) => Math.pow(Math.max(0, Math.sin(t * speed + phase)), 3);
            ctx.globalAlpha = strength * strobe(0);
            ctx.fillStyle = this.beaconLeft;
            ctx.fillRect(0, 0, width, height);
            ctx.globalAlpha = strength * strobe(Math.PI);
            ctx.fillStyle = this.beaconRight;
            ctx.fillRect(0, 0, width, height);
        }

        // Darkness falls off from the middle of the screen: the player's suit
        // lamp is the only thing still working, so they can still see the
        // enemies right on top of them.
        if (this.blackout > 0 && this.darkGradient) {
            ctx.globalAlpha = this.blackout;
            ctx.fillStyle = this.darkGradient;
            ctx.fillRect(0, 0, width, height);
        }

        if (this.edgeGradient) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = this.edgeGradient;
            ctx.fillRect(0, 0, width, height);
        }

        ctx.restore();
    }

    private ensureGradients(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const key = `${width}x${height}:${this.theme}`;
        if (this.gradientKey === key) return;
        this.gradientKey = key;

        const v = this.visuals;
        const edge = ctx.createRadialGradient(
            width / 2, height / 2, Math.min(width, height) * 0.44,
            width / 2, height / 2, Math.max(width, height) * 0.82
        );
        edge.addColorStop(0, 'rgba(0,0,0,0)');
        edge.addColorStop(1, this.withAlpha(v.edge, v.edgeAlpha));
        this.edgeGradient = edge;

        const left = ctx.createLinearGradient(0, 0, width * 0.45, 0);
        left.addColorStop(0, 'rgba(255, 46, 46, 0.55)');
        left.addColorStop(1, 'rgba(255, 46, 46, 0)');
        this.beaconLeft = left;

        const right = ctx.createLinearGradient(width, 0, width * 0.55, 0);
        right.addColorStop(0, 'rgba(255, 46, 46, 0.55)');
        right.addColorStop(1, 'rgba(255, 46, 46, 0)');
        this.beaconRight = right;

        const dark = ctx.createRadialGradient(
            width / 2, height / 2, 0,
            width / 2, height / 2, Math.min(width, height) * 0.55
        );
        dark.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
        dark.addColorStop(0.35, 'rgba(0, 0, 0, 0.5)');
        dark.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
        this.darkGradient = dark;
    }

    /** #rrggbb + alpha → rgba(); anything else is passed through untouched */
    private withAlpha(color: string, alpha: number): string {
        if (color.startsWith('#') && color.length === 7) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
}

export const stageBackdrop = new StageBackdrop();
