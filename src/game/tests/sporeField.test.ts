import { describe, it, expect, vi } from 'vitest';

vi.mock('../../engine/Input', () => ({
    input: { getAxis: () => ({ x: 0, y: 0 }), isMouseDown: false, mousePos: { x: 0, y: 0 } },
}));

import { SporeZone, SPORE_DEATH_EXTEND } from '../weapons/base';

/** A mat with a budget of `budget` seconds, born with `life` */
function mat(life: number, budget: number) {
    const zone = new SporeZone(0, 0, 100, life, 5, 1);
    zone.extensionBudget = budget;
    return zone;
}

describe('a fungal mat feeds on what dies on it', () => {
    it('gains time from a body dropping inside it', () => {
        const zone = mat(3, 10);
        const before = zone.duration;
        expect(zone.feedOnDeath(10, 10)).toBe(true);
        expect(zone.duration).toBeCloseTo(before + SPORE_DEATH_EXTEND);
    });

    it('ignores a death outside its edge', () => {
        const zone = mat(3, 10);
        const before = zone.duration;
        expect(zone.feedOnDeath(500, 0)).toBe(false);
        expect(zone.duration).toBe(before);
    });

    it('cannot be fed past its budget, however much dies on it', () => {
        // THE guard. Without a ceiling, a mat under a late-game crowd gains
        // more than a second per second and simply never dies — "carpet the
        // arena in mushrooms" stops being something you work for and becomes
        // something that happens once and never stops.
        const zone = mat(3, 2.5);
        for (let i = 0; i < 100; i++) zone.feedOnDeath(0, 0);

        expect(zone.duration).toBeCloseTo(3 + 2.5);
        expect(zone.feedOnDeath(0, 0)).toBe(false);
    });

    it('a mat with no budget is inert', () => {
        const zone = mat(3, 0);
        expect(zone.feedOnDeath(0, 0)).toBe(false);
    });

    it('keeps growing when fed instead of snapping back', () => {
        // `lifeProgress` used to be measured from what was LEFT of `duration`,
        // so handing a zone extra seconds read as it suddenly being younger and
        // it shrank on the spot. Measured from elapsed time, a fed mat holds
        // the size it has grown to.
        const zone = mat(3, 10);
        for (let t = 0; t < 3; t += 0.1) zone.update(0.1);
        const grown = zone.radius;

        zone.feedOnDeath(0, 0);
        zone.update(0.016);
        expect(zone.radius).toBeGreaterThanOrEqual(grown);
    });

    it('still rots once the crowd stops feeding it', () => {
        const zone = mat(2, 5);
        zone.feedOnDeath(0, 0);
        for (let t = 0; t < 10; t += 0.1) zone.update(0.1);
        expect(zone.isDead).toBe(true);
    });
});
