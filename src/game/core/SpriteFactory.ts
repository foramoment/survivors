/**
 * SpriteFactory — procedural pixel-art sprite generation.
 *
 * Every sprite in the game is generated in code at runtime (no image assets):
 * - Enemies: seeded symmetric "invader" silhouettes. The seed is a hash of the
 *   enemy name, so each enemy type always looks the same, with a per-type
 *   palette and glowing eyes. Two animation frames (legs/bottom rows differ).
 * - Player: astronaut template with a per-class suit color.
 * - XP crystals: pixel diamond tinted by value tier.
 * - Projectiles: glowing pixel orbs tinted by weapon color.
 * - Background: tileable space-floor textures per theme.
 *
 * All sprites are drawn once into offscreen canvases and cached; rendering
 * uses drawImage with image smoothing disabled to keep pixels crisp.
 */

import { CHARACTER_SPRITES, FALLBACK_SPRITE_ID } from '../data/CharacterSprites';

/** Whole-silhouette recolour applied to an enemy sprite */
export type EnemyTint = 'none' | 'hit' | 'corroded';

/** What a lobbed projectile actually is — see getThrownSprite */
export type ThrownKind = 'grenade' | 'flask' | 'cryo';

/**
 * Pixel grids for thrown objects, 8 wide. Digits index the palette in
 * getThrownSprite; `.` is empty and gets an automatic outline.
 */
const THROWN_SHAPES: Record<ThrownKind, string[]> = {
    // Squat canister with a lit fuse poking out of the top
    grenade: [
        '.....4..',
        '....54..',
        '..5555..',
        '.322223.',
        '32222223',
        '32222223',
        '.322223.',
        '..3333..',
    ],
    // Corked conical flask, heavy liquid pooled in the bottom
    flask: [
        '..5555..',
        '...55...',
        '...22...',
        '..3223..',
        '.322223.',
        '32222223',
        '32222223',
        '.333333.',
    ],
    // Narrow cryo vial with a frosted cap
    cryo: [
        '..5555..',
        '..3223..',
        '..2442..',
        '..2222..',
        '..3223..',
        '..2222..',
        '..3223..',
        '..3333..',
    ],
};

type Palette = {
    dark: string;
    mid: string;
    light: string;
    accent: string;
};

const ENEMY_PALETTES: Record<string, Palette> = {
    'Void Bat': { dark: '#2a1a4a', mid: '#4a2d7a', light: '#7a4dbf', accent: '#ff5577' },
    'Scout Drone': { dark: '#1a3a3a', mid: '#2d6a6a', light: '#4dbfbf', accent: '#ffee44' },
    'Xeno Spider': { dark: '#2a3a1a', mid: '#4a6a2d', light: '#7fbf4d', accent: '#ff4444' },
    'Alien Grunt': { dark: '#3a1a3a', mid: '#6a2d6a', light: '#bf4dbf', accent: '#44ff88' },
    'Mech Trooper': { dark: '#2a2a33', mid: '#4d4d5c', light: '#8a8a9e', accent: '#ff8833' },
    'Asteroid Golem': { dark: '#33291f', mid: '#5c4a38', light: '#8f7355', accent: '#ffaa33' },
    'Void Wraith': { dark: '#1a2a4a', mid: '#2d4a7a', light: '#4d7fbf', accent: '#aaffff' },
    'Death Walker': { dark: '#2e2e2e', mid: '#555555', light: '#9e9e9e', accent: '#ff3333' },
    'Tentacle Horror': { dark: '#3a1a2a', mid: '#6a2d4a', light: '#bf4d7f', accent: '#66ffcc' },
    'Plasma Elemental': { dark: '#3a2a1a', mid: '#6a4a2d', light: '#bf8a4d', accent: '#66ddff' },
    'Doom Harbinger': { dark: '#301a1a', mid: '#5c2d2d', light: '#9e4d4d', accent: '#ffdd22' },
};

/** Deterministic string hash (FNV-1a) */
function hashString(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Seeded PRNG (mulberry32) */
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

function fallbackPalette(name: string): Palette {
    const hue = hashString(name) % 360;
    return {
        dark: `hsl(${hue}, 45%, 18%)`,
        mid: `hsl(${hue}, 50%, 35%)`,
        light: `hsl(${hue}, 60%, 55%)`,
        accent: `hsl(${(hue + 160) % 360}, 100%, 65%)`,
    };
}

const GRID = 16; // logical pixel grid for enemy sprites
const SCALE = 4; // canvas pixels per logical pixel

export class SpriteFactory {
    private cache: Map<string, HTMLCanvasElement> = new Map();

    // =========================================================
    // Enemies
    // =========================================================

    /**
     * `tint` recolours the whole silhouette: white for a hit, acid green while
     * corroded. Every variant is baked and cached, so a screen full of corroded
     * enemies costs the same as a screen full of plain ones — which is the
     * point, since the alternative (a stroked ring per enemy) is a per-frame
     * path for every body in the crowd.
     */
    getEnemySprite(name: string, frame: number, tint: EnemyTint = 'none'): HTMLCanvasElement {
        const key = `enemy:${name}:${frame % 2}:${tint}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.generateEnemySprite(name, frame % 2, tint);
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    getEnemyAccentColor(name: string): string {
        return (ENEMY_PALETTES[name] ?? fallbackPalette(name)).accent;
    }

    getEnemyBodyColor(name: string): string {
        return (ENEMY_PALETTES[name] ?? fallbackPalette(name)).light;
    }

    private generateEnemySprite(name: string, frame: number, tint: EnemyTint): HTMLCanvasElement {
        const palette = ENEMY_PALETTES[name] ?? fallbackPalette(name);
        const rng = mulberry32(hashString(name));

        // Build symmetric bitmap: 0 empty, 1 dark, 2 mid, 3 light
        const grid: number[][] = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
        const half = GRID / 2;
        const cx = half - 0.5;
        const cy = GRID / 2 - 0.5;

        for (let y = 1; y < GRID - 1; y++) {
            for (let x = 1; x < half; x++) {
                // Elliptical density falloff shapes the silhouette
                const dx = (x - cx) / (half - 1.5);
                const dy = (y - cy) / (GRID / 2 - 1.5);
                const d = Math.sqrt(dx * dx + dy * dy);
                const density = 1.05 - d * 1.15;
                if (rng() < density) {
                    const shade = rng();
                    grid[y][x] = shade < 0.25 ? 1 : shade < 0.65 ? 2 : 3;
                }
            }
        }

        // Second animation frame: rebuild the bottom 4 rows (legs wiggle)
        if (frame === 1) {
            const legRng = mulberry32(hashString(name) ^ 0x9e3779b9);
            for (let y = GRID - 5; y < GRID - 1; y++) {
                for (let x = 1; x < half; x++) {
                    if (grid[y][x] !== 0 && legRng() < 0.35) {
                        grid[y][x] = 0;
                        const nx = Math.max(1, Math.min(half - 1, x + (legRng() < 0.5 ? -1 : 1)));
                        grid[y][nx] = 2;
                    }
                }
            }
        }

        // Mirror left half to right
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < half; x++) {
                grid[y][GRID - 1 - x] = grid[y][x];
            }
        }

        // Glowing eyes on the upper third (symmetric pair)
        const eyeRng = mulberry32(hashString(name) ^ 0x51ed270b);
        const eyeY = 4 + Math.floor(eyeRng() * 3);
        const eyeX = 3 + Math.floor(eyeRng() * 3);
        grid[eyeY][eyeX] = 4;
        grid[eyeY][GRID - 1 - eyeX] = 4;

        return this.renderGrid(grid, {
            1: palette.dark,
            2: palette.mid,
            3: palette.light,
            4: palette.accent,
        }, palette.dark, tint);
    }

    // =========================================================
    // Player (astronaut template, suit color per class)
    // =========================================================

    /**
     * `classId` (not the display name) keys the sprite: the name is
     * user-visible and gets translated, the id does not.
     */
    getPlayerSprite(classId: string, frame: number, hurt: boolean = false): HTMLCanvasElement {
        const key = `player:${classId}:${frame % 2}:${hurt ? 'h' : 'n'}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.generatePlayerSprite(classId, frame % 2, hurt);
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    /** Data URL of the idle frame — for DOM character cards */
    getPlayerSpriteUrl(classId: string): string {
        return this.getPlayerSprite(classId, 0).toDataURL();
    }

    private generatePlayerSprite(classId: string, frame: number, hurt: boolean): HTMLCanvasElement {
        const template = CHARACTER_SPRITES[classId] ?? CHARACTER_SPRITES[FALLBACK_SPRITE_ID];
        const p = template.palette;

        const rows = [...template.body, ...template.legs[frame]];

        // Hurt variant is a flat red silhouette, the same language enemies use
        // when they take a hit — it reads instantly and needs no legend
        const colorFor: Record<string, string> = hurt
            ? { h: '#ff6a72', v: '#ffd7d7', s: '#e02030', S: '#ff6a72', d: '#8c1020', a: '#ffd7d7', b: '#6a0a16' }
            : {
                h: p.shell, v: p.visor, s: p.mid, S: p.light, d: p.dark,
                a: p.accent, b: p.boots,
            };

        const w = rows[0].length;
        const h = rows.length;
        const grid: number[][] = [];
        const colors: Record<number, string> = {};
        const codeFor: Record<string, number> = {};
        let nextCode = 1;
        for (let y = 0; y < h; y++) {
            const row: number[] = [];
            for (let x = 0; x < w; x++) {
                const ch = rows[y][x];
                if (ch === '.') { row.push(0); continue; }
                if (!(ch in codeFor)) {
                    codeFor[ch] = nextCode;
                    colors[nextCode] = colorFor[ch];
                    nextCode++;
                }
                row.push(codeFor[ch]);
            }
            grid.push(row);
        }

        return this.renderGrid(grid, colors, p.dark, false);
    }

    // =========================================================
    // XP crystals (pixel diamond, tinted by value tier)
    // =========================================================

    getCrystalSprite(value: number): HTMLCanvasElement {
        // Same hue mapping as the old glow: cyan → red as value grows
        const t = Math.min(value / 60, 1);
        const hue = Math.round((200 - t * 200) / 20) * 20; // bucket to limit cache size
        const key = `crystal:${hue}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.generateCrystalSprite(hue);
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    private generateCrystalSprite(hue: number): HTMLCanvasElement {
        const dark = `hsl(${hue}, 90%, 35%)`;
        const mid = `hsl(${hue}, 95%, 55%)`;
        const light = `hsl(${hue}, 100%, 80%)`;
        const rows = [
            '...11...',
            '..1221..',
            '.122321.',
            '12233221',
            '.122321.',
            '..1221..',
            '...11...',
            '........',
        ];
        const grid = rows.map(r => [...r].map(ch => (ch === '.' ? 0 : Number(ch))));
        return this.renderGrid(grid, { 1: dark, 2: mid, 3: light }, dark, false);
    }

    // =========================================================
    // Projectile orbs (tinted glowing pixel orb)
    // =========================================================

    /** Weapon projectile emoji → orb tint */
    private static readonly PROJECTILE_COLORS: Record<string, string> = {
        '🔥': '#ff6600',
        '❄️': '#88ccff',
        '⚡': '#ffff00',
        '🟢': '#00ff00',
        '⚫': '#8800ff',
        '💿': '#00ffff',
        '🗡️': '#cccccc',
        '⚔️': '#ffffff',
        '🦠': '#88ff00',
        '🧪': '#00ff88',
        '🔋': '#00ff00',
        '💥': '#ff8800',
        '🛸': '#8888ff',
        '🧠': '#ff00ff',
        '☢️': '#ffff00',
        '💣': '#66ddff',
        '🌪️': '#aaddff',
        '🕸️': '#ccffcc',
    };

    getProjectileSprite(emoji: string): HTMLCanvasElement {
        return this.getOrbSprite(SpriteFactory.PROJECTILE_COLORS[emoji] ?? '#ffffff');
    }

    getOrbSprite(color: string): HTMLCanvasElement {
        const key = `orb:${color}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            const rows = [
                '..111...',
                '.12221..',
                '1223321.',
                '1233321.',
                '1223321.',
                '.12221..',
                '..111...',
                '........',
            ];
            const grid = rows.map(r => [...r].map(ch => (ch === '.' ? 0 : Number(ch))));
            sprite = this.renderGrid(grid, { 1: this.shade(color, 0.5), 2: color, 3: '#ffffff' }, this.shade(color, 0.4), false);
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    /**
     * Lobbed grenade: a chunky canister you can actually see arcing through
     * the air (it used to render as a generic projectile orb).
     */
    /**
     * Something thrown on an arc. Every lobbed weapon used to share one round
     * canister recoloured — so a grenade and a flask of acid were the same
     * object in two tints, and the throw told you nothing about what was about
     * to land. Each kind now has its own silhouette:
     *
     *   grenade — squat canister with a fuse, the classic bomb read
     *   flask   — corked conical flask, liquid sloshing in the bottom
     *   cryo    — a cylindrical cryo vial, tall and narrow
     *
     * `2` is the body colour, `3` its shade, `4` a highlight, `5` a dark cap.
     */
    getThrownSprite(kind: ThrownKind = 'grenade', color: string = '#3ddc6e'): HTMLCanvasElement {
        const key = `thrown:${kind}:${color}`;
        let sprite = this.cache.get(key);
        if (sprite) return sprite;

        const rows = THROWN_SHAPES[kind] ?? THROWN_SHAPES.grenade;
        const grid = rows.map(r => [...r].map(ch => (ch === '.' ? 0 : Number(ch))));
        sprite = this.renderGrid(grid, {
            2: color,
            3: this.shade(color, 0.55),
            4: '#ffe9a0',
            5: '#4a4a58',
        }, this.shade(color, 0.35), false);
        this.cache.set(key, sprite);
        return sprite;
    }

    /** Darken/lighten a hex or hsl color by multiplying lightness */
    private shade(color: string, factor: number): string {
        if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
            const hex = color.length === 4
                ? color.slice(1).split('').map(c => c + c).join('')
                : color.slice(1);
            const r = Math.min(255, Math.round(parseInt(hex.slice(0, 2), 16) * factor));
            const g = Math.min(255, Math.round(parseInt(hex.slice(2, 4), 16) * factor));
            const b = Math.min(255, Math.round(parseInt(hex.slice(4, 6), 16) * factor));
            return `rgb(${r}, ${g}, ${b})`;
        }
        return color;
    }

    // =========================================================
    // Arena props (obstacles)
    // =========================================================

    /**
     * Obstacle sprite: a chunky silhouette on a 20×20 logical grid, seeded by
     * `variant` so a stage gets a handful of distinct shapes it can reuse.
     */
    getPropSprite(style: string, variant: number, hue: number): HTMLCanvasElement {
        const key = `prop:${style}:${variant}:${hue}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.generatePropSprite(style, variant, hue);
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    private generatePropSprite(style: string, variant: number, hue: number): HTMLCanvasElement {
        const size = 20;
        const rng = mulberry32(hashString(`${style}:${variant}`));
        const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
        const c = (size - 1) / 2;
        // Shared four-tone ramp: 1 shadow, 2 body, 3 lit body, 4 highlight
        const set = (x: number, y: number, tone: number) => {
            const px = Math.round(x);
            const py = Math.round(y);
            if (px < 0 || py < 0 || px >= size || py >= size) return;
            grid[py][px] = tone;
        };

        if (style === 'crate') {
            // Cargo container: lit top face, shadowed right side, hazard stripe
            const w = 6 + Math.floor(rng() * 2);
            const h = 5 + Math.floor(rng() * 3);
            const x0 = Math.max(0, Math.round(c - w));
            const x1 = Math.min(size - 1, Math.round(c + w));
            const y0 = Math.max(0, Math.round(c - h));
            const y1 = Math.min(size - 1, Math.round(c + h));
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const top = y <= y0 + 1;
                    const bottom = y >= y1 - 1;
                    const right = x >= x1 - 1;
                    grid[y][x] = top ? 3 : bottom || right ? 1 : 2;
                }
            }
            // Panel seam and hazard stripe across the front
            const seam = Math.round(c);
            for (let x = x0 + 1; x <= x1 - 1; x++) {
                grid[seam][x] = 1;
                if (x % 2 === 0) grid[seam - 1][x] = 4;
            }
            // Corner bolts
            set(x0 + 1, y0 + 2, 4);
            set(x1 - 2, y0 + 2, 4);
            set(x0 + 1, y1 - 2, 4);
        } else if (style === 'crystal') {
            // Cluster: one tall shard flanked by two smaller ones, so the
            // silhouette actually fills the collision circle
            const shard = (ox: number, halfW: number, halfH: number, lean: number) => {
                for (let y = 0; y < size; y++) {
                    const t = Math.abs(y - c) / halfH;
                    if (t > 1) continue;
                    const w = halfW * (1 - t);
                    if (w < 0.5) continue;
                    const axis = c + ox + (y - c) * lean;
                    for (let x = Math.round(axis - w); x <= Math.round(axis + w); x++) {
                        const rel = (x - axis) / Math.max(1, w);
                        set(x, y, rel < -0.35 ? 3 : rel > 0.45 ? 1 : Math.abs(rel) < 0.2 ? 4 : 2);
                    }
                }
            };
            shard(0, 3.2 + rng(), 9, (rng() - 0.5) * 0.18);
            shard(-4 - rng() * 1.5, 2 + rng() * 0.6, 5.5 + rng(), -0.12);
            shard(4 + rng() * 1.5, 1.8 + rng() * 0.6, 4.5 + rng(), 0.12);
        } else {
            // Rock: per-angle radius wobble, lit from the upper left, with a
            // bright rim on the lit edge and a couple of craters
            const spikes = Array.from({ length: 8 }, () => 0.7 + rng() * 0.3);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const dx = x - c;
                    const dy = y - c;
                    const dist = Math.hypot(dx, dy) / c;
                    const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2) * spikes.length;
                    const idx = Math.floor(angle) % spikes.length;
                    const next = (idx + 1) % spikes.length;
                    const f = angle - Math.floor(angle);
                    const limit = spikes[idx] + (spikes[next] - spikes[idx]) * f;
                    if (dist > limit) continue;
                    const lit = -(dx + dy) / (c * 1.5);
                    const edge = dist / limit;
                    grid[y][x] = edge > 0.82
                        ? (lit > 0.1 ? 4 : 1)
                        : lit > 0.05 ? 3 : 2;
                }
            }
            for (let i = 0; i < 2; i++) {
                const a = rng() * Math.PI * 2;
                const d = rng() * c * 0.45;
                const cx = c + Math.cos(a) * d;
                const cy = c + Math.sin(a) * d;
                if (grid[Math.round(cy)]?.[Math.round(cx)] === 0) continue;
                set(cx, cy, 2);
                set(cx + 1, cy, 1);
            }
        }

        const palette = style === 'crystal'
            ? {
                1: `hsl(${hue}, 55%, 20%)`,
                2: `hsl(${hue}, 52%, 30%)`,
                3: `hsl(${hue}, 50%, 40%)`,
                4: `hsl(${(hue + 12) % 360}, 90%, 74%)`,
            }
            : {
                1: `hsl(${hue}, 16%, 10%)`,
                2: `hsl(${hue}, 15%, 17%)`,
                3: `hsl(${hue}, 14%, 25%)`,
                4: `hsl(${(hue + 8) % 360}, 20%, 40%)`,
            };

        return this.renderGrid(grid, palette, `hsl(${hue}, 22%, 7%)`, false);
    }

    // =========================================================
    // Background tiles
    // =========================================================

    /**
     * Tileable floor plate. `hue` comes from the stage palette; without it the
     * theme name is hashed into one (keeps older callers working).
     *
     * The tile is deliberately *not* fully opaque: seams are punched out with
     * `destination-out` and the whole plate loses a little alpha, so the
     * parallax starfield behind it (see `core/StageBackdrop`) bleeds through.
     */
    getBackgroundTile(theme: string, hue?: number): HTMLCanvasElement {
        const h = hue ?? hashString(theme) % 360;
        const key = `bg:${theme}:${h}`;
        let tile = this.cache.get(key);
        if (!tile) {
            tile = this.generateBackgroundTile(theme, h);
            this.cache.set(key, tile);
        }
        return tile;
    }

    private generateBackgroundTile(theme: string, hue: number): HTMLCanvasElement {
        const size = 384;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const rng = mulberry32(hashString(theme));

        ctx.fillStyle = `hsl(${hue}, 20%, 7%)`;
        ctx.fillRect(0, 0, size, size);

        // Subtle rocky noise patches
        for (let i = 0; i < 220; i++) {
            const x = Math.floor(rng() * size / 8) * 8;
            const y = Math.floor(rng() * size / 8) * 8;
            const l = 5 + rng() * 6;
            ctx.fillStyle = `hsla(${hue}, 14%, ${l}%, 0.9)`;
            ctx.fillRect(x, y, 8, 8);
        }

        // Glowing speckles (minerals / hull lights)
        for (let i = 0; i < 30; i++) {
            const x = Math.floor(rng() * size);
            const y = Math.floor(rng() * size);
            const bright = 35 + rng() * 35;
            ctx.fillStyle = `hsla(${(hue + 40) % 360}, 55%, ${bright}%, ${0.18 + rng() * 0.2})`;
            ctx.fillRect(x, y, 2, 2);
        }

        // Seams: baked once as short polylines, drawn twice — a faint lit rim,
        // then a hairline transparent core cut straight through the plate.
        // Kept low-contrast on purpose: strong marks make the 384px repeat
        // readable as a grid.
        const seams: Array<Array<[number, number]>> = [];
        for (let i = 0; i < 5; i++) {
            const points: Array<[number, number]> = [];
            let x = rng() * size;
            let y = rng() * size;
            points.push([x, y]);
            for (let s = 0; s < 4; s++) {
                x += (rng() - 0.5) * 55;
                y += (rng() - 0.5) * 55;
                points.push([x, y]);
            }
            seams.push(points);
        }

        const strokeSeams = () => {
            for (const points of seams) {
                ctx.beginPath();
                ctx.moveTo(points[0][0], points[0][1]);
                for (let p = 1; p < points.length; p++) ctx.lineTo(points[p][0], points[p][1]);
                ctx.stroke();
            }
        };

        ctx.strokeStyle = `hsla(${(hue + 20) % 360}, 45%, 30%, 0.10)`;
        ctx.lineWidth = 3;
        strokeSeams();

        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 1.5;
        strokeSeams();

        // Vent holes — small windows onto the void
        for (let i = 0; i < 3; i++) {
            const x = Math.floor(rng() * size);
            const y = Math.floor(rng() * size);
            const w = 4 + Math.floor(rng() * 2) * 4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x, y, w, w);
        }

        // The whole plate is translucent so the parallax layers behind it stay
        // readable — it is a floor floating in space, not a wall.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';

        return canvas;
    }

    // =========================================================
    // Shared renderer: bitmap grid → outlined pixel sprite canvas
    // =========================================================

    private renderGrid(
        grid: number[][],
        colors: Record<number, string>,
        outlineBase: string,
        tint: EnemyTint | boolean = 'none'
    ): HTMLCanvasElement {
        const flat = tint === true ? '#ffffff'
            : tint === 'hit' ? '#ffffff'
                : tint === 'corroded' ? '#b4ff3c'
                    : null;
        const h = grid.length;
        const w = grid[0].length;
        const canvas = document.createElement('canvas');
        canvas.width = w * SCALE;
        canvas.height = h * SCALE;
        const ctx = canvas.getContext('2d')!;

        const outline = flat ?? this.shade(outlineBase, 0.5);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const cell = grid[y][x];
                if (cell === 0) {
                    // Outline: empty cell adjacent to a filled cell
                    const filledNeighbor =
                        (y > 0 && grid[y - 1][x] !== 0) ||
                        (y < h - 1 && grid[y + 1][x] !== 0) ||
                        (x > 0 && grid[y][x - 1] !== 0) ||
                        (x < w - 1 && grid[y][x + 1] !== 0);
                    if (filledNeighbor) {
                        ctx.fillStyle = outline;
                        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
                    }
                    continue;
                }
                ctx.fillStyle = flat ?? (colors[cell] ?? '#ff00ff');
                ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
            }
        }

        return canvas;
    }
}

export const sprites = new SpriteFactory();
