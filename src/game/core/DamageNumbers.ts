/**
 * DAMAGE NUMBERS — the digits that pop off a hit.
 *
 * Self-contained: it owns the pool, the arc physics and the pixel-font pass,
 * and it also owns the *feedback* that belongs to a hit landing (the tick, the
 * crit chime, the micro-freeze). Those used to sit in GameManager purely
 * because the spawn call did.
 */
import type { Vector2 } from './Utils';
import { drawPixelText } from './PixelFont';
import { audio } from './AudioSystem';
import { juice } from './JuiceSystem';

interface DamageNumber {
    x: number;
    y: number;
    vx: number;
    vy: number;
    text: string;
    life: number;
    maxLife: number;
    isCrit: boolean;
}

/**
 * Cap on how many digits may be on screen. Late-game AoE can produce hundreds
 * per second, and past this many the screen is unreadable anyway.
 */
const MAX_ON_SCREEN = 90;

/** Minimum real seconds between crit hit-stops, so a volley cannot stutter */
const CRIT_STOP_GAP = 0.35;

export class DamageNumbers {
    private items: DamageNumber[] = [];
    /** Real time of the last crit hit-stop, to rate-limit the effect */
    private lastCritStop: number = 0;

    clear() {
        this.items = [];
    }

    spawn(pos: Vector2, amount: number, isCrit: boolean = false) {
        if (this.items.length > MAX_ON_SCREEN) this.items.shift();

        const life = isCrit ? 0.8 : 0.55;
        this.items.push({
            // Wide horizontal jitter so simultaneous hits don't stack into an
            // unreadable pile of digits
            x: pos.x + (Math.random() - 0.5) * 28,
            y: pos.y,
            // Arc upward and outward so overlapping hits stay readable
            vx: (Math.random() - 0.5) * 60,
            vy: isCrit ? -160 : -110,
            text: Math.floor(amount).toString(),
            life,
            maxLife: life,
            isCrit,
        });

        if (!isCrit) {
            audio.play('hit');
            return;
        }

        audio.play('crit');
        const now = performance.now() / 1000;
        if (now - this.lastCritStop > CRIT_STOP_GAP) {
            this.lastCritStop = now;
            juice.hitStop(0.035);
            juice.addTrauma(0.06);
        }
    }

    update(dt: number) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const dn = this.items[i];
            dn.life -= dt;
            if (dn.life <= 0) {
                this.items.splice(i, 1);
                continue;
            }
            dn.x += dn.vx * dt;
            dn.y += dn.vy * dt;
            dn.vy += 260 * dt;  // gravity — the numbers arc and settle
            dn.vx *= 0.94;
        }
    }

    /** Pixel-font damage numbers: crits pop bigger, brighter and outlined */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (this.items.length === 0) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const dn of this.items) {
            const t = 1 - dn.life / dn.maxLife;
            // Punch-in scale for the first 15% of the lifetime
            const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : 1.15 - (t - 0.15) * 0.15;
            const base = dn.isCrit ? 3.4 : 2.2;
            const scale = Math.max(1, Math.round(base * pop));

            ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
            drawPixelText(ctx, dn.text, dn.x - camera.x, dn.y - camera.y, {
                scale,
                align: 'center',
                spacing: 1,
                shadow: 1,
                color: dn.isCrit ? '#ffe14d' : '#ffffff',
                outline: dn.isCrit ? '#ff4400' : undefined,
            });
        }
        ctx.restore();
    }
}
