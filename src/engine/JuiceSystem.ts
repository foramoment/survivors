/**
 * JuiceSystem — the "game feel" layer: screen shake, hit-stop, flashes,
 * zoom punches and shockwave rings.
 *
 * Everything here is cosmetic and frame-driven; no gameplay state lives in it.
 * Two rules keep it from taking over the screen:
 *   1. Shake uses a *trauma* model (Jan Willem Nijman / Squirrel Eiserloh):
 *      callers add trauma, the offset is `trauma²`, and trauma decays linearly.
 *      Squaring means small hits barely register while big ones slam.
 *   2. Every effect is clamped and decays on its own, so a burst of 50 kills
 *      cannot stack into an unplayable screen.
 *
 * Time control (`hitStop` / `slowMo`) is exposed as `timeScale`, which the
 * engine multiplies into `dt` — the juice system itself always updates with
 * *real* time so effects still resolve while the world is frozen.
 */

import type { Vector2 } from './Utils';

interface Flash {
    color: string;
    alpha: number;
    life: number;
    maxLife: number;
}

interface Shockwave {
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    color: string;
    life: number;
    maxLife: number;
    width: number;
}

/** Smooth 1D value noise — jitter that looks like a camera, not like static */
function valueNoise(seed: number, t: number): number {
    const i = Math.floor(t);
    const f = t - i;
    const hash = (n: number) => {
        let h = Math.imul(n ^ seed, 0x27d4eb2d);
        h ^= h >>> 15;
        return ((h >>> 0) / 4294967295) * 2 - 1;
    };
    const a = hash(i);
    const b = hash(i + 1);
    // Smoothstep interpolation
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
}

export class JuiceSystem {
    /** 0..1 — squared to get the actual shake amount */
    private trauma: number = 0;
    private traumaDecay: number = 1.4;
    private shakeTime: number = 0;
    /** Max pixel offset at full trauma */
    maxShakeOffset: number = 34;
    /** Max rotation (radians) at full trauma */
    maxShakeAngle: number = 0.035;

    private flashes: Flash[] = [];
    private shockwaves: Shockwave[] = [];

    private hitStopTimer: number = 0;
    private slowMoTimer: number = 0;
    private slowMoScale: number = 1;

    /** Additive zoom on top of 1.0, decays with a spring-ish ease */
    private zoom: number = 0;
    private zoomVelocity: number = 0;

    /** Chromatic-ish vignette pulse (0..1) */
    private vignette: number = 0;

    /** Global toggle so players on weak devices / with motion sickness can opt out */
    enabled: boolean = true;

    // =========================================================
    // Triggers
    // =========================================================

    /** Add camera trauma (0..1). Small hits ~0.1, boss deaths ~0.6. */
    addTrauma(amount: number) {
        if (!this.enabled) return;
        this.trauma = Math.min(1, this.trauma + amount);
        this.shakeTime = Math.max(this.shakeTime, 0.001);
    }

    /**
     * Legacy pixel-magnitude API used across the game.
     * Converted into trauma so all shake sources share one budget.
     */
    shake(magnitude: number, duration: number = 0.3) {
        this.addTrauma(Math.min(1, Math.sqrt(magnitude / this.maxShakeOffset)) * Math.min(1, duration / 0.4 + 0.4));
    }

    /** Freeze the world for a few frames — the single best impact amplifier */
    hitStop(seconds: number) {
        if (!this.enabled) return;
        this.hitStopTimer = Math.max(this.hitStopTimer, Math.min(0.25, seconds));
    }

    /** Ramp time down (0.2 = 20% speed) for `seconds` of real time */
    slowMo(scale: number, seconds: number) {
        if (!this.enabled) return;
        this.slowMoScale = Math.max(0.05, scale);
        this.slowMoTimer = Math.max(this.slowMoTimer, seconds);
    }

    /** Full-screen colour wash that fades out */
    flash(color: string, alpha: number = 0.35, duration: number = 0.25) {
        if (!this.enabled) return;
        // Cap concurrent flashes so a kill streak can't white out the screen
        if (this.flashes.length > 4) this.flashes.shift();
        this.flashes.push({ color, alpha, life: duration, maxLife: duration });
    }

    /** Kick the camera in (positive) or out (negative) */
    zoomPunch(amount: number) {
        if (!this.enabled) return;
        this.zoomVelocity += amount;
    }

    /** Expanding ring in world space — reads as a pressure wave */
    shockwave(x: number, y: number, maxRadius: number, color: string = '#ffffff', duration: number = 0.35, width: number = 6) {
        if (!this.enabled) return;
        if (this.shockwaves.length > 12) this.shockwaves.shift();
        this.shockwaves.push({ x, y, radius: 0, maxRadius, color, life: duration, maxLife: duration, width });
    }

    /** Darken the screen edges briefly (danger / boss presence) */
    pulseVignette(amount: number = 0.6) {
        if (!this.enabled) return;
        this.vignette = Math.min(1, this.vignette + amount);
    }

    // =========================================================
    // Frame update (always fed REAL delta time)
    // =========================================================

    update(realDt: number) {
        if (this.hitStopTimer > 0) this.hitStopTimer -= realDt;
        if (this.slowMoTimer > 0) this.slowMoTimer -= realDt;

        this.shakeTime += realDt;
        if (this.trauma > 0) {
            this.trauma = Math.max(0, this.trauma - this.traumaDecay * realDt);
        }

        // Spring the zoom back to neutral
        this.zoomVelocity -= this.zoom * 42 * realDt;
        this.zoomVelocity *= Math.max(0, 1 - 9 * realDt);
        this.zoom += this.zoomVelocity * realDt;
        if (Math.abs(this.zoom) < 0.0005 && Math.abs(this.zoomVelocity) < 0.0005) {
            this.zoom = 0;
            this.zoomVelocity = 0;
        }

        this.vignette = Math.max(0, this.vignette - realDt * 1.5);

        for (let i = this.flashes.length - 1; i >= 0; i--) {
            this.flashes[i].life -= realDt;
            if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
        }

        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= realDt;
            const progress = 1 - s.life / s.maxLife;
            // Ease-out so the ring bursts outward then settles
            s.radius = s.maxRadius * (1 - Math.pow(1 - progress, 3));
            if (s.life <= 0) this.shockwaves.splice(i, 1);
        }
    }

    /**
     * Nothing left to resolve: no shake, no flash, no ring, no zoom spring,
     * and time running at its normal speed.
     *
     * The host uses this to decide whether a frame is worth painting at all.
     * When the world is frozen (a level-up panel, the result screen) and juice
     * is idle, the next frame is pixel-identical to the one already on screen —
     * so **anything that can change what a frame looks like has to be listed
     * here**, or it will silently stop animating.
     */
    get idle(): boolean {
        return this.trauma <= 0
            && this.flashes.length === 0
            && this.shockwaves.length === 0
            && this.vignette <= 0
            && this.zoom === 0
            && this.zoomVelocity === 0
            && this.hitStopTimer <= 0
            && this.slowMoTimer <= 0;
    }

    /** Multiplier the engine applies to gameplay delta time */
    get timeScale(): number {
        if (this.hitStopTimer > 0) return 0;
        if (this.slowMoTimer > 0) return this.slowMoScale;
        return 1;
    }

    // =========================================================
    // Camera queries
    // =========================================================

    getShakeOffset(): Vector2 {
        if (this.trauma <= 0) return { x: 0, y: 0 };
        const amount = this.trauma * this.trauma;
        const t = this.shakeTime * 34;
        return {
            x: valueNoise(1013, t) * amount * this.maxShakeOffset,
            y: valueNoise(3719, t) * amount * this.maxShakeOffset,
        };
    }

    getShakeAngle(): number {
        if (this.trauma <= 0) return 0;
        const amount = this.trauma * this.trauma;
        return valueNoise(7907, this.shakeTime * 22) * amount * this.maxShakeAngle;
    }

    /** Camera scale factor (1 = neutral) */
    getZoom(): number {
        return 1 + this.zoom;
    }

    // =========================================================
    // Rendering
    // =========================================================

    /** World-space effects — call inside the camera transform */
    drawWorld(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (this.shockwaves.length === 0) return;
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        for (const s of this.shockwaves) {
            const fade = Math.max(0, s.life / s.maxLife);
            ctx.globalAlpha = fade * 0.85;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = Math.max(1, s.width * fade);
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 12 * fade;
            ctx.beginPath();
            ctx.arc(s.x, s.y, Math.max(1, s.radius), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** Screen-space overlay — call last, outside any camera transform */
    drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
        if (this.flashes.length === 0 && this.vignette <= 0) return;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        for (const f of this.flashes) {
            // Fast attack, slower fade reads as a real light burst
            const progress = 1 - f.life / f.maxLife;
            const curve = progress < 0.15
                ? progress / 0.15
                : Math.pow(1 - (progress - 0.15) / 0.85, 2);
            ctx.globalAlpha = Math.max(0, f.alpha * curve);
            ctx.fillStyle = f.color;
            ctx.fillRect(0, 0, width, height);
        }

        if (this.vignette > 0) {
            const gradient = ctx.createRadialGradient(
                width / 2, height / 2, Math.min(width, height) * 0.3,
                width / 2, height / 2, Math.max(width, height) * 0.72
            );
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, `rgba(90,0,20,${(0.75 * this.vignette).toFixed(3)})`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }

        ctx.restore();
    }

    reset() {
        this.trauma = 0;
        this.flashes.length = 0;
        this.shockwaves.length = 0;
        this.hitStopTimer = 0;
        this.slowMoTimer = 0;
        this.zoom = 0;
        this.zoomVelocity = 0;
        this.vignette = 0;
    }
}

export const juice = new JuiceSystem();
