import { describe, it, expect } from 'vitest';
import { PropField } from '../core/PropField';
import { STAGES, type StageConfig } from '../data/StageData';

const field = (stage: StageConfig = STAGES[0]) => {
    const f = new PropField();
    f.setStage(stage);
    return f;
};

describe('PropField', () => {
    it('generates the same props for the same stage and place', () => {
        const a = field().getNearby({ x: 3000, y: -2200 }, 900);
        const b = field().getNearby({ x: 3000, y: -2200 }, 900);

        expect(a.length).toBeGreaterThan(0);
        expect(b).toEqual(a);
    });

    it('gives each stage a different obstacle layout', () => {
        const rocks = field(STAGES[0]).getNearby({ x: 2000, y: 2000 }, 800);
        const shards = field(STAGES[2]).getNearby({ x: 2000, y: 2000 }, 800);
        expect(shards).not.toEqual(rocks);
    });

    it('keeps the spawn area clear', () => {
        const f = field();
        for (const prop of f.getNearby({ x: 0, y: 0 }, 1200)) {
            expect(Math.hypot(prop.x, prop.y)).toBeGreaterThan(300);
        }
        expect(f.isBlocked({ x: 0, y: 0 }, 40)).toBe(false);
    });

    it('pushes an overlapping entity out to the surface', () => {
        const f = field();
        const prop = f.getNearby({ x: 4000, y: 4000 }, 900)[0];
        expect(prop).toBeDefined();

        const entity = { pos: { x: prop.x + 4, y: prop.y - 3 }, radius: 12 };
        expect(f.resolve(entity)).toBe(true);

        const dist = Math.hypot(entity.pos.x - prop.x, entity.pos.y - prop.y);
        expect(dist).toBeCloseTo(prop.radius + entity.radius, 4);
        expect(f.isBlocked(entity.pos, entity.radius - 0.01)).toBe(false);
    });

    it('leaves entities in the open alone', () => {
        const f = field();
        const entity = { pos: { x: 0, y: 0 }, radius: 12 };
        expect(f.resolve(entity)).toBe(false);
        expect(entity.pos).toEqual({ x: 0, y: 0 });
    });

    it('slides a blocked enemy sideways toward the player', () => {
        const f = field();
        const prop = f.getNearby({ x: 4000, y: 4000 }, 900)[0];
        // Enemy jammed straight into the far side of the prop from the player
        const player = { x: prop.x - 400, y: prop.y };
        const entity = { pos: { x: prop.x + 2, y: prop.y + 2 }, radius: 12 };
        f.resolve(entity, player, 120, 0.1);

        // Pushed to the surface and nudged along it, not left on the normal axis
        const dist = Math.hypot(entity.pos.x - prop.x, entity.pos.y - prop.y);
        expect(dist).toBeGreaterThan(prop.radius);
        expect(Math.abs(entity.pos.y - (prop.y + 2))).toBeGreaterThan(0);
    });

    it('drops far-away chunks as the player walks on', () => {
        const f = field();
        for (let i = 0; i < 60; i++) f.update({ x: i * 520, y: 0 });
        expect((f as any).chunks.size).toBeLessThanOrEqual(120);
    });

    it('honours a stage with no obstacles', () => {
        const empty = { ...STAGES[0], props: { ...STAGES[0].props, density: 0 } };
        const f = field(empty);
        expect(f.getNearby({ x: 5000, y: 5000 }, 1000)).toHaveLength(0);
        expect(f.isBlocked({ x: 5000, y: 5000 }, 30)).toBe(false);
    });
});
