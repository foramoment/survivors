import { describe, it, expect } from 'vitest';
import { drawPixelText, measurePixelText } from './PixelFont';

interface Rect { x: number; y: number; w: number; h: number; style: string }

/** A canvas that remembers every fillRect instead of drawing it */
function recorder() {
    const rects: Rect[] = [];
    const ctx = {
        fillStyle: '#000000',
        fillRect(x: number, y: number, w: number, h: number) {
            rects.push({ x, y, w, h, style: String(ctx.fillStyle) });
        },
        createLinearGradient: () => ({ addColorStop() { } }),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

/** Every unit cell covered by rects of one colour, as "x,y" keys */
function pixelsOf(rects: Rect[], style: string): Set<string> {
    const cells = new Set<string>();
    for (const r of rects) {
        if (r.style !== style) continue;
        for (let x = 0; x < r.w; x++) {
            for (let y = 0; y < r.h; y++) cells.add(`${r.x + x},${r.y + y}`);
        }
    }
    return cells;
}

/** Grow a pixel set by one in each of the four axis directions */
function dilate(cells: Set<string>): Set<string> {
    const grown = new Set<string>();
    for (const key of cells) {
        const [x, y] = key.split(',').map(Number);
        grown.add(`${x - 1},${y}`);
        grown.add(`${x + 1},${y}`);
        grown.add(`${x},${y - 1}`);
        grown.add(`${x},${y + 1}`);
    }
    return grown;
}

describe('drawPixelText', () => {
    const FILL = '#ffffff';
    const OUTLINE = '#ff4400';

    it('draws each row as spans instead of one rect per pixel', () => {
        // The hot loop of every damage number in the game. A glyph row like
        // '#####' is one rect, not five — which is where the frame time of a
        // screen full of damage numbers actually went.
        const { ctx, rects } = recorder();
        drawPixelText(ctx, '1234567890', 0, 0, { scale: 1, shadow: 0, color: FILL });

        const lit = pixelsOf(rects, FILL);
        expect(lit.size).toBeGreaterThan(0);
        // Meaningfully fewer draw calls than lit pixels is the whole point
        expect(rects.length).toBeLessThan(lit.size * 0.75);
    });

    it('an outline is the glyph grown by one, and costs one pass', () => {
        // It used to be four shifted copies of the string, so an outlined
        // number cost six passes against two for a plain one — and damage
        // numbers switch to outlined crit styling as soon as crit damage
        // carries half a merged total, which one crit-damage perk is enough to
        // do. The union of four plus-shifts IS the plus-dilation, so this must
        // paint exactly the same shape.
        const plain = recorder();
        drawPixelText(plain.ctx, '42', 0, 0, { scale: 1, shadow: 0, color: FILL });

        const outlined = recorder();
        drawPixelText(outlined.ctx, '42', 0, 0, {
            scale: 1, shadow: 0, color: FILL, outline: OUTLINE,
        });

        const body = pixelsOf(plain.rects, FILL);
        // The outline does not disturb the glyph itself
        expect(pixelsOf(outlined.rects, FILL)).toEqual(body);

        // ...and it covers the dilation of it (the body is painted over on top,
        // so compare the union of the two layers)
        const ring = pixelsOf(outlined.rects, OUTLINE);
        const union = new Set([...ring, ...body]);
        const expected = new Set([...dilate(body), ...body]);
        expect(union).toEqual(expected);

        // One extra pass, not four
        const extraCalls = outlined.rects.length - plain.rects.length;
        expect(extraCalls).toBeLessThan(plain.rects.length * 2);
    });

    it('scales spans without leaving seams', () => {
        const { ctx, rects } = recorder();
        drawPixelText(ctx, '1', 0, 0, { scale: 3, shadow: 0, color: FILL });

        for (const r of rects) {
            expect(r.h).toBe(3);
            expect(r.w % 3).toBe(0);
            expect(r.x % 3).toBe(0);
            expect(r.y % 3).toBe(0);
        }
    });

    it('centres on the width it measures', () => {
        const { ctx, rects } = recorder();
        drawPixelText(ctx, '77', 100, 0, { scale: 2, shadow: 0, align: 'center', color: FILL });

        const width = measurePixelText('77', 2, 1);
        const xs = rects.map(r => r.x);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(100 - width / 2);
        expect(Math.max(...xs)).toBeLessThan(100 + width / 2);
    });

    it('renders nothing for a character it has no glyph for', () => {
        const { ctx, rects } = recorder();
        drawPixelText(ctx, '☃', 0, 0, { scale: 1, shadow: 0 });
        expect(rects).toHaveLength(0);
    });
});
