import { describe, it, expect, vi } from 'vitest';
import { ArenaEventSystem, type ArenaContext } from '../core/ArenaEvents';
import { DifficultyDirector, ArenaSchedule } from '../core/DifficultyDirector';
import { STAGES } from '../data/StageData';

function context(overrides: Partial<ArenaContext> = {}): ArenaContext {
    return {
        playerPos: { x: 0, y: 0 },
        damagePlayer: vi.fn(),
        spawnAt: vi.fn(),
        viewWidth: 1280,
        viewHeight: 800,
        gameTime: 120,
        ...overrides,
    };
}

/** Run the system forward in 60fps steps */
function run(system: ArenaEventSystem, seconds: number, ctx: ArenaContext) {
    for (let i = 0; i < Math.round(seconds * 60); i++) system.update(1 / 60, ctx);
}

describe('ArenaEventSystem', () => {
    it('runs a meteor shower and finishes', () => {
        const system = new ArenaEventSystem();
        const ctx = context();

        system.trigger('meteors', ctx);
        expect(system.active).toBe(true);

        run(system, 12, ctx);
        expect(system.active).toBe(false);
    });

    it('telegraphs every meteor before it can hurt anything', () => {
        const system = new ArenaEventSystem();
        const damagePlayer = vi.fn();
        const ctx = context({ damagePlayer });

        system.trigger('meteors', ctx);
        // Well inside the fuse window: rocks are marked on the ground, not landed
        run(system, 0.9, ctx);
        expect(damagePlayer).not.toHaveBeenCalled();
    });

    it('only one event runs at a time', () => {
        const system = new ArenaEventSystem();
        const ctx = context();
        system.trigger('blackout', ctx);
        system.trigger('meteors', ctx);
        expect(system.kind).toBe('blackout');
    });

    it('blackout dims the arena and speeds enemies up, then restores both', () => {
        const system = new ArenaEventSystem();
        const ctx = context();

        system.trigger('blackout', ctx);
        expect(system.blackoutAmount).toBe(0);
        expect(system.enemySpeedMultiplier).toBe(1);

        run(system, 5, ctx);
        expect(system.blackoutAmount).toBe(1);
        expect(system.enemySpeedMultiplier).toBeGreaterThan(1);

        run(system, 8, ctx);
        expect(system.active).toBe(false);
        expect(system.blackoutAmount).toBe(0);
        expect(system.enemySpeedMultiplier).toBe(1);
    });

    it('rifts open before they pour enemies out, then stop', () => {
        const system = new ArenaEventSystem();
        const spawnAt = vi.fn();
        const ctx = context({ spawnAt });

        system.trigger('rifts', ctx);
        run(system, 1.4, ctx);
        expect(spawnAt).not.toHaveBeenCalled();

        run(system, 4, ctx);
        expect(spawnAt).toHaveBeenCalled();

        const afterOpen = spawnAt.mock.calls.length;
        run(system, 8, ctx);
        expect(system.active).toBe(false);
        const settled = spawnAt.mock.calls.length;
        run(system, 3, ctx);
        expect(spawnAt.mock.calls.length).toBe(settled);
        expect(settled).toBeGreaterThan(afterOpen);
    });

    it('reset stops everything mid-event', () => {
        const system = new ArenaEventSystem();
        const ctx = context();
        system.trigger('meteors', ctx);
        run(system, 3, ctx);
        system.reset();
        expect(system.active).toBe(false);
        expect(system.blackoutAmount).toBe(0);
    });
});

describe('DifficultyDirector arena scheduling', () => {
    const ctx = {
        gameTime: 0,
        playerLevel: 1,
        playerHpRatio: 1,
        enemyCount: 10,
        killCount: 0,
    };

    it('schedules the first hazard after the opening minute', () => {
        const director = new DifficultyDirector();
        for (let t = 0; t < ArenaSchedule.FIRST - 1; t += 1 / 60) {
            director.update(1 / 60, { ...ctx, gameTime: t });
        }
        expect(director.consumeEvents().some(e => e.type === 'arena')).toBe(false);

        for (let t = 0; t < 2; t += 1 / 60) director.update(1 / 60, { ...ctx, gameTime: 45 + t });
        expect(director.consumeEvents().some(e => e.type === 'arena')).toBe(true);
    });

    it('keeps hazards inside the 30-60s cadence', () => {
        const director = new DifficultyDirector();
        const times: number[] = [];
        for (let t = 0; t < 400; t += 1 / 60) {
            director.update(1 / 60, { ...ctx, gameTime: t });
            if (director.consumeEvents().some(e => e.type === 'arena')) times.push(t);
        }
        expect(times.length).toBeGreaterThan(4);
        for (let i = 1; i < times.length; i++) {
            const gap = times[i] - times[i - 1];
            expect(gap).toBeGreaterThanOrEqual(ArenaSchedule.MIN - 0.5);
            expect(gap).toBeLessThanOrEqual(ArenaSchedule.MAX + 0.5);
        }
    });

    it('reset clears the hazard timer', () => {
        const director = new DifficultyDirector();
        for (let t = 0; t < 44; t += 1 / 60) director.update(1 / 60, { ...ctx, gameTime: t });
        director.reset();
        for (let t = 0; t < 2; t += 1 / 60) director.update(1 / 60, { ...ctx, gameTime: t });
        expect(director.consumeEvents().some(e => e.type === 'arena')).toBe(false);
    });
});

describe('StageData events', () => {
    it('every stage names a hazard', () => {
        const kinds = new Set(STAGES.map(s => s.event));
        expect(kinds.size).toBe(STAGES.length);
        for (const stage of STAGES) {
            expect(['meteors', 'blackout', 'rifts']).toContain(stage.event);
        }
    });
});
