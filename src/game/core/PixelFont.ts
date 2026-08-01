/**
 * PixelFont — a 5×7 bitmap font defined in code.
 *
 * The whole game generates its art procedurally (see SpriteFactory), and the
 * menus needed real pixel type to match. Web fonts were rejected on purpose:
 * the build ships as a static bundle (GitHub Pages + Capacitor) and must work
 * offline, so the glyphs live here as strings instead.
 *
 * Latin and Cyrillic uppercase are defined — lowercase input is upcased
 * (`toUpperCase` handles both alphabets). Unknown characters render as blanks.
 */

const GLYPH_W = 5;
const GLYPH_H = 7;

const GLYPHS: Record<string, string[]> = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['#####', '...#.', '..##.', '....#', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
    '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
    ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
    '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
    '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],

    // Cyrillic uppercase — the Russian locale draws arena banners and the menu
    // tagline through this font too. Letters whose shape matches a Latin one
    // (А В Е К М Н О Р С Т Х) are aliased below the table instead of copied.
    'Б': ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'],
    'Г': ['#####', '#....', '#....', '#....', '#....', '#....', '#....'],
    'Д': ['..###', '..#.#', '..#.#', '.#..#', '.#..#', '#####', '#...#'],
    'Ж': ['#.#.#', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '#.#.#'],
    'З': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    'И': ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
    'Й': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
    'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '#...#', '#...#'],
    'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
    'У': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '.#...', '#....'],
    'Ф': ['..#..', '.###.', '#.#.#', '#.#.#', '#.#.#', '.###.', '..#..'],
    'Ц': ['#...#', '#...#', '#...#', '#...#', '#...#', '#####', '....#'],
    'Ч': ['#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'],
    'Ш': ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'],
    'Щ': ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####', '....#'],
    'Ъ': ['##...', '.#...', '.#...', '.###.', '.#..#', '.#..#', '.###.'],
    'Ы': ['#...#', '#...#', '#...#', '###.#', '#..##', '#..##', '###.#'],
    'Ь': ['#....', '#....', '#....', '###..', '#..#.', '#..#.', '###..'],
    'Э': ['.###.', '#...#', '....#', '..###', '....#', '#...#', '.###.'],
    'Ю': ['#.##.', '#.#.#', '#.#.#', '#####', '#.#.#', '#.#.#', '#.##.'],
    'Я': ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'],
};

/**
 * Cyrillic letters that are visually identical to a Latin glyph at 5×7, plus
 * Ё → Е (no room for the diaeresis in seven rows).
 */
const CYRILLIC_ALIASES: Record<string, string> = {
    'А': 'A', 'В': 'B', 'Е': 'E', 'Ё': 'E', 'К': 'K', 'М': 'M',
    'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
};

for (const [cyrillic, latin] of Object.entries(CYRILLIC_ALIASES)) {
    GLYPHS[cyrillic] = GLYPHS[latin];
}

export interface PixelTextOptions {
    /** Canvas pixels per font pixel */
    scale?: number;
    color?: string;
    /** Hard drop shadow offset in font pixels (0 = none) */
    shadow?: number;
    shadowColor?: string;
    /** Solid 1px outline around every glyph */
    outline?: string;
    /** Extra space between glyphs, in font pixels */
    spacing?: number;
    align?: 'left' | 'center' | 'right';
    /** Per-glyph vertical offset in font pixels (index → offset) — for wavy text */
    wave?: (index: number) => number;
    /** Optional gradient applied top→bottom across the text block */
    gradient?: string[];
}

/** Width of `text` in canvas pixels */
export function measurePixelText(text: string, scale: number = 4, spacing: number = 1): number {
    if (text.length === 0) return 0;
    return (text.length * (GLYPH_W + spacing) - spacing) * scale;
}

export const PIXEL_GLYPH_HEIGHT = GLYPH_H;

/** True if `char` has a glyph — unknown characters draw as blanks */
export function hasPixelGlyph(char: string): boolean {
    return char.toUpperCase() in GLYPHS;
}

/**
 * Draw pixel text. `x`/`y` is the top-left of the text block (or top-center /
 * top-right depending on `align`).
 */
export function drawPixelText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    options: PixelTextOptions = {}
): void {
    const scale = options.scale ?? 4;
    const spacing = options.spacing ?? 1;
    const color = options.color ?? '#ffffff';
    const shadow = options.shadow ?? 0;
    const shadowColor = options.shadowColor ?? 'rgba(0,0,0,0.85)';
    const chars = [...text.toUpperCase()];

    const totalWidth = measurePixelText(text, scale, spacing);
    let startX = x;
    if (options.align === 'center') startX = x - totalWidth / 2;
    else if (options.align === 'right') startX = x - totalWidth;

    // Gradient is built once over the glyph height so every letter matches
    let fill: string | CanvasGradient = color;
    if (options.gradient && options.gradient.length > 1) {
        const grad = ctx.createLinearGradient(0, y, 0, y + GLYPH_H * scale);
        options.gradient.forEach((c, i) => grad.addColorStop(i / (options.gradient!.length - 1), c));
        fill = grad;
    }

    const drawPass = (offsetX: number, offsetY: number, style: string | CanvasGradient) => {
        ctx.fillStyle = style;
        chars.forEach((ch, i) => {
            const glyph = GLYPHS[ch];
            if (!glyph) return;
            const gx = startX + i * (GLYPH_W + spacing) * scale + offsetX;
            const waveY = options.wave ? options.wave(i) * scale : 0;
            const gy = y + offsetY + waveY;
            for (let row = 0; row < GLYPH_H; row++) {
                const line = glyph[row];
                for (let col = 0; col < GLYPH_W; col++) {
                    if (line[col] !== '#') continue;
                    ctx.fillRect(gx + col * scale, gy + row * scale, scale, scale);
                }
            }
        });
    };

    if (options.outline) {
        // 4-way outline (cheap, and enough at pixel scale)
        const o = scale;
        drawPass(-o, 0, options.outline);
        drawPass(o, 0, options.outline);
        drawPass(0, -o, options.outline);
        drawPass(0, o, options.outline);
    }
    if (shadow > 0) drawPass(shadow * scale, shadow * scale, shadowColor);
    drawPass(0, 0, fill);
}
