import { describe, it, expect, beforeEach } from 'vitest';
import { JuiceSystem } from '../../engine/JuiceSystem';
import { measurePixelText, drawPixelText } from '../../engine/PixelFont';

/** Minimal 2D-context stand-in — enough to prove the draw paths don't throw */
function mockCtx() {
    const calls = { fillRect: 0, arc: 0, stroke: 0, save: 0, restore: 0 };
    return {
        calls,
        canvas: { width: 800, height: 600 },
        globalAlpha: 1,
        fillStyle: '' as any,
        strokeStyle: '' as any,
        lineWidth: 1,
        shadowColor: '',
        shadowBlur: 0,
        save() { calls.save++; },
        restore() { calls.restore++; },
        translate() { },
        rotate() { },
        scale() { },
        setTransform() { },
        beginPath() { },
        arc() { calls.arc++; },
        stroke() { calls.stroke++; },
        fillRect() { calls.fillRect++; },
        createLinearGradient() { return { addColorStop() { } }; },
        createRadialGradient() { return { addColorStop() { } }; },
    } as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

describe('JuiceSystem', () => {
    let juice: JuiceSystem;

    beforeEach(() => {
        juice = new JuiceSystem();
    });

    it('shakes after trauma and settles back to zero', () => {
        juice.addTrauma(1);
        juice.update(0.016);
        const offset = juice.getShakeOffset();
        expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0);

        // Trauma decays within a second
        for (let i = 0; i < 90; i++) juice.update(0.016);
        const settled = juice.getShakeOffset();
        expect(settled.x).toBe(0);
        expect(settled.y).toBe(0);
        expect(juice.getShakeAngle()).toBe(0);
    });

    it('caps trauma at 1 so stacked hits cannot escalate', () => {
        for (let i = 0; i < 20; i++) juice.addTrauma(0.5);
        juice.update(0.001);
        const offset = juice.getShakeOffset();
        expect(Math.abs(offset.x)).toBeLessThanOrEqual(juice.maxShakeOffset);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(juice.maxShakeOffset);
    });

    it('freezes time during hit-stop and restores it after', () => {
        juice.hitStop(0.1);
        expect(juice.timeScale).toBe(0);
        juice.update(0.11);
        expect(juice.timeScale).toBe(1);
    });

    it('clamps hit-stop so a bad caller cannot freeze the game', () => {
        juice.hitStop(10);
        juice.update(0.26);
        expect(juice.timeScale).toBe(1);
    });

    it('applies slow motion for its duration', () => {
        juice.slowMo(0.3, 0.5);
        expect(juice.timeScale).toBeCloseTo(0.3);
        juice.update(0.6);
        expect(juice.timeScale).toBe(1);
    });

    it('springs the zoom punch back to neutral', () => {
        juice.zoomPunch(0.8);
        juice.update(0.016);
        expect(juice.getZoom()).not.toBe(1);
        for (let i = 0; i < 200; i++) juice.update(0.016);
        expect(juice.getZoom()).toBeCloseTo(1, 3);
    });

    it('does nothing while disabled', () => {
        juice.enabled = false;
        juice.addTrauma(1);
        juice.hitStop(0.2);
        juice.zoomPunch(1);
        juice.update(0.016);
        expect(juice.getShakeOffset()).toEqual({ x: 0, y: 0 });
        expect(juice.timeScale).toBe(1);
        expect(juice.getZoom()).toBe(1);
    });

    it('reset clears every active effect', () => {
        juice.addTrauma(1);
        juice.hitStop(0.2);
        juice.slowMo(0.2, 1);
        juice.reset();
        expect(juice.timeScale).toBe(1);
        expect(juice.getShakeOffset()).toEqual({ x: 0, y: 0 });
    });

    /**
     * The engine stops painting frames when the world is frozen and juice is
     * idle, so a source of animation missing from `idle` does not cost a few
     * cycles — it stops being drawn. Every setter is checked here for that
     * reason, and a new one belongs in this list.
     */
    describe('idle', () => {
        const settle = (j: JuiceSystem) => { for (let i = 0; i < 400; i++) j.update(0.05); };

        it('is true on a fresh system', () => {
            expect(juice.idle).toBe(true);
        });

        const sources: Array<[string, (j: JuiceSystem) => void]> = [
            ['trauma', j => j.addTrauma(0.8)],
            ['hit-stop', j => j.hitStop(0.1)],
            ['slow motion', j => j.slowMo(0.3, 0.5)],
            ['flash', j => j.flash('#fff', 0.5, 0.3)],
            ['zoom punch', j => j.zoomPunch(0.8)],
            ['shockwave', j => j.shockwave(0, 0, 300, '#fff')],
            ['vignette', j => j.pulseVignette(1)],
        ];

        for (const [name, start] of sources) {
            it(`is false while a ${name} is running, and true once it resolves`, () => {
                start(juice);
                expect(juice.idle, `${name} should keep the frame live`).toBe(false);
                settle(juice);
                expect(juice.idle, `${name} should resolve`).toBe(true);
            });
        }

        it('is true with effects disabled, because nothing can start', () => {
            juice.enabled = false;
            juice.addTrauma(1);
            juice.flash('#fff', 1, 1);
            juice.shockwave(0, 0, 300, '#fff');
            expect(juice.idle).toBe(true);
        });
    });
});

describe('JuiceSystem rendering', () => {
    it('draws shockwaves in world space and flashes in screen space', () => {
        const juice = new JuiceSystem();
        const ctx = mockCtx() as any;

        juice.shockwave(100, 100, 200, '#fff');
        juice.flash('#fff', 0.5, 0.3);
        juice.pulseVignette(1);
        juice.update(0.016);

        juice.drawWorld(ctx, { x: 0, y: 0 });
        expect(ctx.calls.arc).toBe(1);

        juice.drawOverlay(ctx, 800, 600);
        expect(ctx.calls.fillRect).toBeGreaterThan(0);
    });

    it('skips overlay work when nothing is active', () => {
        const juice = new JuiceSystem();
        const ctx = mockCtx() as any;
        juice.drawWorld(ctx, { x: 0, y: 0 });
        juice.drawOverlay(ctx, 800, 600);
        expect(ctx.calls.save).toBe(0);
    });
});

describe('PixelFont', () => {
    it('measures text as glyph width plus spacing', () => {
        // 3 glyphs × (5 + 1 spacing) − trailing spacing = 17 font px
        expect(measurePixelText('ABC', 1, 1)).toBe(17);
        expect(measurePixelText('ABC', 4, 1)).toBe(68);
        expect(measurePixelText('', 4, 1)).toBe(0);
    });

    it('renders every supported glyph without throwing', () => {
        const ctx = mockCtx() as any;
        drawPixelText(ctx, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?:-+/\'()<>*=%_', 0, 0, {
            scale: 2, align: 'center', shadow: 1, outline: '#000',
        });
        expect(ctx.calls.fillRect).toBeGreaterThan(100);
    });

    it('supports gradient fills and unknown characters', () => {
        const ctx = mockCtx() as any;
        drawPixelText(ctx, 'hi~world', 10, 10, { gradient: ['#fff', '#000'], wave: (i) => i % 2 });
        expect(ctx.calls.fillRect).toBeGreaterThan(0);
    });
});
