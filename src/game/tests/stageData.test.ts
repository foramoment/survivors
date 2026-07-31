import { describe, it, expect } from 'vitest';
import { STAGES } from '../data/StageData';
import { ENEMIES } from '../data/GameData';

describe('StageData', () => {
    it('has at least 3 stages with unique ids', () => {
        expect(STAGES.length).toBeGreaterThanOrEqual(3);
        const ids = new Set(STAGES.map(s => s.id));
        expect(ids.size).toBe(STAGES.length);
    });

    it('every enemy pool index points to an existing enemy', () => {
        for (const stage of STAGES) {
            for (const index of stage.enemyPool) {
                expect(index).toBeGreaterThanOrEqual(0);
                expect(index).toBeLessThan(ENEMIES.length);
            }
        }
    });

    it('enemy pools have at least 2 entries (primary + secondary waves)', () => {
        for (const stage of STAGES) {
            expect(stage.enemyPool.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('durations and scales are sane', () => {
        for (const stage of STAGES) {
            expect(stage.duration).toBeGreaterThanOrEqual(60);
            expect(stage.hpScale).toBeGreaterThan(0);
            expect(stage.damageScale).toBeGreaterThan(0);
        }
    });

    it('every stage carries a full visual palette', () => {
        for (const stage of STAGES) {
            const v = stage.visuals;
            expect(v.nebula).toHaveLength(2);
            expect(v.floorHue).toBeGreaterThanOrEqual(0);
            expect(v.floorHue).toBeLessThan(360);
            expect(v.lightAlpha).toBeGreaterThan(0);
            expect(v.lightAlpha).toBeLessThanOrEqual(0.25);
            expect(v.edgeAlpha).toBeGreaterThan(0);
            expect(v.edgeAlpha).toBeLessThanOrEqual(0.8);
            for (const color of [v.space, v.star, v.dust, v.light, v.edge]) {
                expect(color).toMatch(/^#[0-9a-f]{6}$/i);
            }
        }
    });

    it('stages are visually distinct from each other', () => {
        const hues = new Set(STAGES.map(s => s.visuals.floorHue));
        expect(hues.size).toBe(STAGES.length);
    });

    it('stages get progressively harder', () => {
        for (let i = 1; i < STAGES.length; i++) {
            expect(STAGES[i].hpScale).toBeGreaterThan(STAGES[i - 1].hpScale);
        }
    });
});
