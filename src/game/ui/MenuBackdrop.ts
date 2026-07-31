/**
 * MenuBackdrop — the animated pixel-space scene behind every menu screen.
 *
 * Drawn straight to the game canvas (menus are DOM on top of it), so it costs
 * nothing but a few hundred fillRects per frame. Everything is procedural:
 *   - three parallax star layers,
 *   - a pre-rendered pixel planet with craters and a terminator shadow,
 *   - a nebula haze baked once into an offscreen canvas,
 *   - enemy sprites from SpriteFactory drifting past at different depths.
 */

import { sprites } from '../core/SpriteFactory';
import { ENEMIES } from '../data/GameData';

interface Star {
    x: number;
    y: number;
    /** 0 = far (slow, dim), 2 = near (fast, bright) */
    layer: number;
    size: number;
    twinkle: number;
}

interface Drifter {
    name: string;
    x: number;
    y: number;
    vx: number;
    scale: number;
    bob: number;
    phase: number;
}

const STAR_COLORS = ['#5a6a9a', '#93a7d6', '#ffffff'];

export class MenuBackdrop {
    private stars: Star[] = [];
    private drifters: Drifter[] = [];
    private nebula: HTMLCanvasElement | null = null;
    private planet: HTMLCanvasElement | null = null;
    private width = 0;
    private height = 0;
    private time = 0;

    private ensureLayout(width: number, height: number) {
        if (this.width === width && this.height === height && this.stars.length) return;
        this.width = width;
        this.height = height;

        // Stars: density scales with area so big screens don't look empty
        const count = Math.min(420, Math.round((width * height) / 5200));
        this.stars = Array.from({ length: count }, () => {
            const layer = Math.floor(Math.random() * 3);
            return {
                x: Math.random() * width,
                y: Math.random() * height,
                layer,
                size: layer === 2 ? 3 : layer === 1 ? 2 : 2,
                twinkle: Math.random() * Math.PI * 2,
            };
        });

        this.drifters = Array.from({ length: 5 }, (_, i) => this.makeDrifter(i / 5));
        this.nebula = this.renderNebula(width, height);
        this.planet = this.planet ?? this.renderPlanet(160);
    }

    private makeDrifter(progress: number = Math.random()): Drifter {
        const type = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
        const scale = 0.5 + Math.random() * 1.3;
        const dir = Math.random() < 0.5 ? 1 : -1;
        return {
            name: type.name,
            x: dir > 0 ? -80 + progress * (this.width + 160) : this.width + 80 - progress * (this.width + 160),
            y: 60 + Math.random() * (this.height - 160),
            vx: dir * (10 + Math.random() * 26) * scale,
            scale,
            bob: 6 + Math.random() * 14,
            phase: Math.random() * Math.PI * 2,
        };
    }

    /** Soft coloured haze, baked once — gradients per frame would be wasteful */
    private renderNebula(width: number, height: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(width / 4));
        canvas.height = Math.max(1, Math.floor(height / 4));
        const ctx = canvas.getContext('2d')!;
        const blobs = [
            { x: 0.22, y: 0.28, r: 0.45, color: 'rgba(120, 40, 200, 0.35)' },
            { x: 0.78, y: 0.62, r: 0.5, color: 'rgba(0, 160, 200, 0.28)' },
            { x: 0.5, y: 0.9, r: 0.4, color: 'rgba(220, 30, 120, 0.22)' },
        ];
        for (const b of blobs) {
            const cx = b.x * canvas.width;
            const cy = b.y * canvas.height;
            const r = b.r * Math.max(canvas.width, canvas.height);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, b.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return canvas;
    }

    /** Chunky pixel planet: banded surface, craters, night-side terminator */
    private renderPlanet(size: number): HTMLCanvasElement {
        const px = 4; // pixel block size
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const r = size / 2;

        for (let y = 0; y < size; y += px) {
            for (let x = 0; x < size; x += px) {
                const dx = x + px / 2 - r;
                const dy = y + px / 2 - r;
                const dist = Math.hypot(dx, dy);
                if (dist > r) continue;

                // Latitude bands + a little noise give a gas-giant look
                const band = Math.sin((y / size) * 9 + Math.sin(x / size * 3) * 0.6);
                const lightness = 32 + band * 9 + Math.random() * 5;
                // Terminator: darken toward the lower-right
                const shade = Math.max(0, (dx + dy) / (r * 2));
                ctx.fillStyle = `hsl(268, 48%, ${Math.max(8, lightness - shade * 22).toFixed(1)}%)`;
                ctx.fillRect(x, y, px, px);
            }
        }

        // Craters
        for (let i = 0; i < 14; i++) {
            const angle = Math.random() * Math.PI * 2;
            const d = Math.random() * r * 0.82;
            const cx = Math.round((r + Math.cos(angle) * d) / px) * px;
            const cy = Math.round((r + Math.sin(angle) * d) / px) * px;
            const cr = px * (1 + Math.floor(Math.random() * 3));
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
        }

        // Rim light on the upper-left
        ctx.globalCompositeOperation = 'source-atop';
        const rim = ctx.createLinearGradient(0, 0, size, size);
        rim.addColorStop(0, 'rgba(180, 140, 255, 0.35)');
        rim.addColorStop(0.45, 'rgba(0,0,0,0)');
        ctx.fillStyle = rim;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';

        return canvas;
    }

    update(dt: number, width: number, height: number) {
        this.ensureLayout(width, height);
        this.time += dt;

        for (const star of this.stars) {
            star.x -= (6 + star.layer * 16) * dt;
            star.y += (2 + star.layer * 4) * dt;
            if (star.x < -4) {
                star.x = width + 4;
                star.y = Math.random() * height;
            }
            if (star.y > height + 4) {
                star.y = -4;
                star.x = Math.random() * width;
            }
        }

        for (let i = 0; i < this.drifters.length; i++) {
            const d = this.drifters[i];
            d.x += d.vx * dt;
            if (d.x < -120 || d.x > width + 120) this.drifters[i] = this.makeDrifter(0);
        }
    }

    draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
        this.ensureLayout(width, height);

        // Deep space base
        ctx.fillStyle = '#05040d';
        ctx.fillRect(0, 0, width, height);

        if (this.nebula) {
            ctx.save();
            ctx.globalAlpha = 0.75 + 0.12 * Math.sin(this.time * 0.35);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(this.nebula, 0, 0, width, height);
            ctx.restore();
        }

        // Stars
        for (const star of this.stars) {
            const flicker = 0.55 + 0.45 * Math.sin(this.time * 3 + star.twinkle);
            ctx.globalAlpha = star.layer === 2 ? flicker : 0.35 + star.layer * 0.2;
            ctx.fillStyle = STAR_COLORS[star.layer];
            ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
        }
        ctx.globalAlpha = 1;

        // Planet, low-right, slowly bobbing
        if (this.planet) {
            const size = Math.min(width, height) * 0.42;
            const px = width * 0.82;
            const py = height * 0.78 + Math.sin(this.time * 0.4) * 6;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = 0.9;
            ctx.shadowColor = 'rgba(150, 90, 255, 0.5)';
            ctx.shadowBlur = 40;
            ctx.drawImage(this.planet, px - size / 2, py - size / 2, size, size);
            ctx.restore();
        }

        // Drifting enemies — a preview of what is waiting out there
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const d of this.drifters) {
            const frame = Math.floor(this.time * 5 + d.phase) % 2;
            const sprite = sprites.getEnemySprite(d.name, frame);
            const size = 48 * d.scale;
            const y = d.y + Math.sin(this.time * 1.4 + d.phase) * d.bob;
            ctx.globalAlpha = 0.18 + 0.22 * d.scale;
            if (d.vx < 0) {
                ctx.save();
                ctx.translate(d.x, y);
                ctx.scale(-1, 1);
                ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
                ctx.restore();
            } else {
                ctx.drawImage(sprite, d.x - size / 2, y - size / 2, size, size);
            }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }
}

export const menuBackdrop = new MenuBackdrop();
