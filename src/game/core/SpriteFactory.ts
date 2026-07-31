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

    getEnemySprite(name: string, frame: number, flash: boolean = false): HTMLCanvasElement {
        const key = `enemy:${name}:${frame % 2}:${flash ? 'f' : 'n'}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.generateEnemySprite(name, frame % 2, flash);
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

    private generateEnemySprite(name: string, frame: number, flash: boolean): HTMLCanvasElement {
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
        }, palette.dark, flash);
    }

    // =========================================================
    // Player (astronaut template, suit color per class)
    // =========================================================

    getPlayerSprite(className: string, frame: number): HTMLCanvasElement {
        const key = `player:${className}:${frame % 2}`;
        let sprite = this.cache.get(key);
        if (!sprite) {
            sprite = this.generatePlayerSprite(className, frame % 2);
            this.cache.set(key, sprite);
        }
        return sprite;
    }

    private generatePlayerSprite(className: string, frame: number): HTMLCanvasElement {
        const hue = hashString(className) % 360;
        const suitDark = `hsl(${hue}, 55%, 30%)`;
        const suit = `hsl(${hue}, 60%, 48%)`;
        const suitLight = `hsl(${hue}, 65%, 65%)`;
        const visor = '#66eeff';
        const white = '#e8e8f0';

        // 12 wide × 16 tall template, drawn as strings for readability.
        // . empty, h helmet(white), v visor, s suit, S suit light, d suit dark, b boots
        const legA = [
            '..dss..ssd..',
            '..ds....sd..',
            '..bb....bb..',
        ];
        const legB = [
            '...dssssd...',
            '...ds..sd...',
            '...bb..bb...',
        ];
        const rows = [
            '....hhhh....',
            '...hhhhhh...',
            '..hhvvvvhh..',
            '..hhvvvvhh..',
            '...hhhhhh...',
            '....ssss....',
            '..sSssssSs..',
            '.dsSssssSsd.',
            '.dssssssssd.',
            '.d.ssssss.d.',
            '...ssssss...',
            '...dssssd...',
            '...dssssd...',
            ...(frame === 0 ? legA : legB),
        ];

        const colorFor: Record<string, string> = {
            h: white, v: visor, s: suit, S: suitLight, d: suitDark, b: '#333340',
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

        return this.renderGrid(grid, colors, suitDark, false);
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
        flash: boolean
    ): HTMLCanvasElement {
        const h = grid.length;
        const w = grid[0].length;
        const canvas = document.createElement('canvas');
        canvas.width = w * SCALE;
        canvas.height = h * SCALE;
        const ctx = canvas.getContext('2d')!;

        const outline = flash ? '#ffffff' : this.shade(outlineBase, 0.5);

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
                ctx.fillStyle = flash ? '#ffffff' : (colors[cell] ?? '#ff00ff');
                ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
            }
        }

        return canvas;
    }
}

export const sprites = new SpriteFactory();
