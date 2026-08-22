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
/**
 * One horizontal span of lit pixels inside a glyph: `[row, startCol, length]`.
 *
 * A glyph used to be drawn a pixel at a time — up to 35 `fillRect` calls per
 * character per pass. Rows are mostly solid runs ('#####' is one rect, not
 * five), so collapsing them cuts the call count by roughly three with no change
 * to what lands on the canvas. This is the hot loop of every damage number, HP
 * bar label and arena banner in the game.
 */
type Run = [row: number, col: number, len: number];

/** Lit spans per glyph, and the same for its outline, both built once */
const GLYPH_RUNS = new Map<string, Run[]>();
const OUTLINE_RUNS = new Map<string, Run[]>();
const NO_RUNS: Run[] = [];

/** Collapse a boolean bitmap into horizontal runs */
function toRuns(rows: boolean[][], rowOffset: number, colOffset: number): Run[] {
    const runs: Run[] = [];
    for (let r = 0; r < rows.length; r++) {
        let start = -1;
        for (let c = 0; c <= rows[r].length; c++) {
            const lit = c < rows[r].length && rows[r][c];
            if (lit && start < 0) start = c;
            if (!lit && start >= 0) {
                runs.push([r + rowOffset, start + colOffset, c - start]);
                start = -1;
            }
        }
    }
    return runs;
}

function runsOf(ch: string): Run[] {
    let runs = GLYPH_RUNS.get(ch);
    if (runs) return runs;
    const glyph = GLYPHS[ch];
    if (!glyph) return NO_RUNS;

    const bits: boolean[][] = glyph.map(line => {
        const row: boolean[] = [];
        for (let c = 0; c < GLYPH_W; c++) row.push(line[c] === '#');
        return row;
    });
    runs = toRuns(bits, 0, 0);
    GLYPH_RUNS.set(ch, runs);
    return runs;
}

/**
 * The glyph grown by one pixel up, down, left and right — the exact shape four
 * shifted copies used to paint between them, on a grid one pixel wider on every
 * side. Diagonals are deliberately absent: the old outline shifted along the
 * axes only, and matching it keeps the look identical.
 */
function outlineRunsOf(ch: string): Run[] {
    let runs = OUTLINE_RUNS.get(ch);
    if (runs) return runs;
    const glyph = GLYPHS[ch];
    if (!glyph) return NO_RUNS;

    const grown: boolean[][] = [];
    for (let r = 0; r < GLYPH_H + 2; r++) grown.push(new Array(GLYPH_W + 2).fill(false));
    const lit = (r: number, c: number) =>
        r >= 0 && r < GLYPH_H && c >= 0 && c < GLYPH_W && glyph[r][c] === '#';

    for (let r = -1; r <= GLYPH_H; r++) {
        for (let c = -1; c <= GLYPH_W; c++) {
            if (lit(r - 1, c) || lit(r + 1, c) || lit(r, c - 1) || lit(r, c + 1)) {
                grown[r + 1][c + 1] = true;
            }
        }
    }
    runs = toRuns(grown, -1, -1);
    OUTLINE_RUNS.set(ch, runs);
    return runs;
}

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

    const drawPass = (
        offsetX: number,
        offsetY: number,
        style: string | CanvasGradient,
        runsOf: (ch: string) => Run[],
    ) => {
        ctx.fillStyle = style;
        chars.forEach((ch, i) => {
            const runs = runsOf(ch);
            if (runs.length === 0) return;
            const gx = startX + i * (GLYPH_W + spacing) * scale + offsetX;
            const waveY = options.wave ? options.wave(i) * scale : 0;
            const gy = y + offsetY + waveY;
            for (let r = 0; r < runs.length; r++) {
                const run = runs[r];
                ctx.fillRect(gx + run[1] * scale, gy + run[0] * scale, run[2] * scale, scale);
            }
        });
    };

    if (options.outline) {
        // One dilated pass, not four shifted copies of the glyph.
        //
        // The four-way outline drew the whole string four extra times, so an
        // outlined number cost SIX passes against two for a plain one. Damage
        // numbers style themselves as crits once crit damage carries half the
        // total (see DamageNumbers.mergeInto), which a run with crit damage and
        // 30% crit chance crosses — so taking one crit-damage perk quietly
        // tripled the cost of the busiest text on screen, and the player
        // reported exactly that: "I took the crit bonus and the frame rate
        // dropped when a crowd is on me".
        //
        // The union of four plus-shifted copies IS the plus-dilation of the
        // glyph, so this draws the identical shape in one pass.
        drawPass(0, 0, options.outline, outlineRunsOf);
    }
    if (shadow > 0) drawPass(shadow * scale, shadow * scale, shadowColor, runsOf);
    drawPass(0, 0, fill, runsOf);
}
