import { describe, it, expect, beforeEach } from 'vitest';
import { DifficultyDirector, type DifficultyContext } from '../core/DifficultyDirector';

function makeContext(overrides: Partial<DifficultyContext> = {}): DifficultyContext {
    return {
        gameTime: 0,
        playerLevel: 1,
        playerHpRatio: 1,
        enemyCount: 0,
        killCount: 0,
        ...overrides,
    };
}

describe('DifficultyDirector', () => {
    let director: DifficultyDirector;

    beforeEach(() => {
        director = new DifficultyDirector();
    });

    describe('spawn budget', () => {
        it('is framerate independent (60 small steps ≈ 1 big step)', () => {
            const a = new DifficultyDirector();
            const b = new DifficultyDirector();

            for (let i = 0; i < 60; i++) {
                a.update(1 / 60, makeContext());
            }
            b.update(1, makeContext());

            const spawnsA = a.takeSpawnCount(0);
            const spawnsB = b.takeSpawnCount(0);
            expect(Math.abs(spawnsA - spawnsB)).toBeLessThanOrEqual(1);
        });

        it('spawns roughly base rate at t=0 (~2/sec)', () => {
            director.update(1, makeContext());
            expect(director.takeSpawnCount(0)).toBe(2);
        });

        it('never exceeds population cap', () => {
            director.update(10, makeContext({ gameTime: 600 }));
            const spawns = director.takeSpawnCount(DifficultyDirector.MAX_ENEMIES - 3);
            expect(spawns).toBeLessThanOrEqual(3);
        });

        it('does not bank a spawn wall while at the cap', () => {
            for (let i = 0; i < 30; i++) {
                director.update(1, makeContext({ gameTime: 300 }));
                director.takeSpawnCount(DifficultyDirector.MAX_ENEMIES);
            }
            // Once space frees up, only a trickle should come out, not hundreds
            expect(director.takeSpawnCount(0)).toBeLessThanOrEqual(1);
        });
    });

    describe('adaptive intensity', () => {
        it('rises when the player is at full HP and clearing everything', () => {
            let kills = 0;
            for (let i = 0; i < 30; i++) {
                kills += 40; // killing far faster than spawn rate
                director.update(1, makeContext({ playerHpRatio: 1, killCount: kills, gameTime: i }));
            }
            expect(director.intensity).toBeGreaterThan(1.5);
        });

        it('falls when the player is low HP and not killing', () => {
            for (let i = 0; i < 30; i++) {
                director.update(1, makeContext({ playerHpRatio: 0.2, killCount: 0, gameTime: i }));
            }
            expect(director.intensity).toBeLessThan(1);
        });

        it('stays within clamps', () => {
            let kills = 0;
            for (let i = 0; i < 500; i++) {
                kills += 100;
                director.update(1, makeContext({ playerHpRatio: 1, killCount: kills, gameTime: i }));
            }
            expect(director.intensity).toBeLessThanOrEqual(DifficultyDirector.MAX_INTENSITY);

            const weak = new DifficultyDirector();
            for (let i = 0; i < 500; i++) {
                weak.update(1, makeContext({ playerHpRatio: 0, killCount: 0, gameTime: i }));
            }
            expect(weak.intensity).toBeGreaterThanOrEqual(DifficultyDirector.MIN_INTENSITY);
        });
    });

    describe('wave events', () => {
        it('emits burst + miniboss exactly once per wave boundary', () => {
            director.update(1, makeContext({ gameTime: 59 }));
            expect(director.consumeEvents()).toHaveLength(0);

            director.update(1, makeContext({ gameTime: 61 }));
            const events = director.consumeEvents();
            expect(events.map(e => e.type).sort()).toEqual(['burst', 'miniboss']);

            director.update(1, makeContext({ gameTime: 62 }));
            expect(director.consumeEvents()).toHaveLength(0);
        });

        it('burst size grows with wave index', () => {
            director.update(1, makeContext({ gameTime: 61 }));
            const wave1 = director.consumeEvents().find(e => e.type === 'burst') as any;

            const late = new DifficultyDirector();
            late.update(1, makeContext({ gameTime: 200 }));
            const wave3 = late.consumeEvents().find(e => e.type === 'burst') as any;

            expect(wave3.count).toBeGreaterThan(wave1.count);
        });
    });

    describe('enemy scaling', () => {
        it('HP multiplier is no longer capped at 3x', () => {
            // Old formula: min(1 + t/300, 3). At 20 minutes it should exceed 3.
            expect(director.getHpMultiplier(1200)).toBeGreaterThan(3);
        });

        it('HP multiplier grows with intensity', () => {
            const base = director.getHpMultiplier(300);
            director.intensity = DifficultyDirector.MAX_INTENSITY;
            expect(director.getHpMultiplier(300)).toBeGreaterThan(base);
        });

        it('elite chance grows over time and stays capped', () => {
            expect(director.getEliteChance(0)).toBeCloseTo(0.01);
            expect(director.getEliteChance(600)).toBeGreaterThan(0.01);
            expect(director.getEliteChance(100000)).toBeLessThanOrEqual(0.08);
        });

        it('reset returns everything to baseline', () => {
            director.intensity = 3;
            director.update(100, makeContext({ gameTime: 500 }));
            director.reset();
            expect(director.intensity).toBe(1);
            expect(director.takeSpawnCount(0)).toBe(0);
            expect(director.consumeEvents()).toHaveLength(0);
        });
    });
});
