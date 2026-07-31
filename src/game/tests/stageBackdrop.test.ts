import { describe, it, expect, beforeAll } from 'vitest';
import { StageBackdrop } from '../core/StageBackdrop';
import { STAGES } from '../data/StageData';

/** Records every fill so the tests can assert which palette was used */
function mockCtx() {
    const fills: string[] = [];
    const calls = { fillRect: 0, createPattern: 0, radial: 0, linear: 0 };
    const ctx: any = {
        fills,
        calls,
        canvas: { width: 800, height: 600 },
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '' as any,
        strokeStyle: '' as any,
        lineWidth: 1,
        shadowColor: '',
        shadowBlur: 0,
        save() { },
        restore() { },
        translate() { },
        setTransform() { },
        beginPath() { },
        moveTo() { },
        lineTo() { },
        stroke() { },
        fillRect() {
            calls.fillRect++;
            if (typeof ctx.fillStyle === 'string') fills.push(ctx.fillStyle);
        },
        createPattern() { calls.createPattern++; return { pattern: true }; },
        createRadialGradient() { calls.radial++; return { addColorStop() { } }; },
        createLinearGradient() { calls.linear++; return { addColorStop() { } }; },
    };
    return ctx;
}

beforeAll(() => {
    // Node test env has no DOM; offscreen tiles only need a 2D-ish context
    (globalThis as any).document = {
        createElement: () => ({ width: 0, height: 0, getContext: () => mockCtx() }),
    };
});

describe('StageBackdrop', () => {
    it('draws the stage palette behind the floor', () => {
        const backdrop = new StageBackdrop();
        const ctx = mockCtx();

        backdrop.update(0.016, { x: 0, y: 0 }, 800, 600);
        backdrop.draw(ctx, { x: 0, y: 0 }, 800, 600);

        // Void base, far nebula pattern, floor pattern, stars and dust
        expect(ctx.fills).toContain(STAGES[0].visuals.space);
        expect(ctx.fills).toContain(STAGES[0].visuals.star);
        expect(ctx.fills).toContain(STAGES[0].visuals.dust);
        expect(ctx.calls.createPattern).toBe(2);
    });

    it('switching stages rebuilds the layers with the new palette', () => {
        const backdrop = new StageBackdrop();
        const ctx = mockCtx();

        backdrop.setStage(STAGES[2]);
        backdrop.update(0.016, { x: 0, y: 0 }, 800, 600);
        backdrop.draw(ctx, { x: 0, y: 0 }, 800, 600);

        expect(ctx.fills).toContain(STAGES[2].visuals.space);
        expect(ctx.fills).not.toContain(STAGES[0].visuals.space);
    });

    it('lighting washes the screen in the stage colour', () => {
        const backdrop = new StageBackdrop();
        const ctx = mockCtx();

        backdrop.setStage(STAGES[1]);
        backdrop.drawLighting(ctx, 800, 600);

        expect(ctx.fills).toContain(STAGES[1].visuals.light);
        // Vignette gradient is cached, not rebuilt every frame
        const radialCalls = ctx.calls.radial;
        backdrop.drawLighting(ctx, 800, 600);
        expect(ctx.calls.radial).toBe(radialCalls);
    });

    it('keeps the near layer on screen through a camera teleport', () => {
        const backdrop = new StageBackdrop();
        backdrop.update(0.016, { x: 0, y: 0 }, 800, 600);
        // New run: camera jumps thousands of pixels in one frame
        backdrop.update(0.016, { x: 12000, y: -8000 }, 800, 600);
        // And a few normal frames of fast movement
        for (let i = 0; i < 30; i++) {
            backdrop.update(0.016, { x: 12000 + i * 40, y: -8000 + i * 40 }, 800, 600);
        }

        const motes = (backdrop as any).motes as Array<{ x: number, y: number }>;
        expect(motes.length).toBeGreaterThan(0);
        for (const m of motes) {
            expect(m.x).toBeGreaterThanOrEqual(-61);
            expect(m.x).toBeLessThanOrEqual(861);
            expect(m.y).toBeGreaterThanOrEqual(-61);
            expect(m.y).toBeLessThanOrEqual(661);
        }
    });
});
