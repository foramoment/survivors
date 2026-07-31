import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitLightning: vi.fn(),
        emit: vi.fn(),
        emitHit: vi.fn(),
    },
}));

vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealDamage: vi.fn(() => ({ finalDamage: 10, isCrit: false, killed: false })),
        dealRawDamage: vi.fn(),
    },
}));

vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => []),
        getNearby: vi.fn(() => []),
    },
}));

import { LightningChainWeapon, StaticFieldZone } from '../weapons/implementations/LightningChainWeapon';
import { ChainLightning } from '../weapons/base';
import { levelSpatialHash } from '../core/SpatialHash';
import { damageSystem } from '../core/DamageSystem';

function makeOwner(): any {
    return {
        pos: { x: 0, y: 0 },
        stats: { might: 1, area: 1, cooldown: 1, speed: 1, duration: 1 },
        weapons: [],
    };
}

function makeEnemy(x: number, y: number): any {
    return { pos: { x, y }, radius: 12, isDead: false, takeDamage: vi.fn() };
}

function fire(weapon: LightningChainWeapon): { chain: ChainLightning; spawned: any[] } {
    const spawned: any[] = [];
    weapon.onSpawn = (e: any) => spawned.push(e);
    weapon.fire(makeEnemy(10, 10));
    const chain = spawned.find(e => e instanceof ChainLightning) as ChainLightning;
    expect(chain).toBeDefined();
    return { chain, spawned };
}

describe('LightningChainWeapon', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
    });

    it('has a short strike range so it cannot reach across the screen', () => {
        const weapon = new LightningChainWeapon(makeOwner());
        expect(weapon.area).toBe(260);
    });

    it('keeps the chain bounded at both tiers', () => {
        const base = new LightningChainWeapon(makeOwner());
        base.level = 20;
        expect(fire(base).chain.bounces).toBeLessThanOrEqual(10);

        const evolved = new LightningChainWeapon(makeOwner());
        evolved.evolved = true;
        const chain = fire(evolved).chain;
        expect(chain.bounces).toBeLessThanOrEqual(12);
        expect(chain.maxChainLength).toBeLessThanOrEqual(1300);
    });

    it('makes the evolved chain hop noticeably slower', () => {
        const base = new LightningChainWeapon(makeOwner());
        const evolved = new LightningChainWeapon(makeOwner());
        evolved.evolved = true;
        expect(fire(evolved).chain.hopInterval).toBeGreaterThan(fire(base).chain.hopInterval);
    });

    it('drops a static field per impact only when evolved', () => {
        const base = new LightningChainWeapon(makeOwner());
        const spawnedBase: any[] = [];
        base.onSpawn = (e: any) => spawnedBase.push(e);
        base.fire(makeEnemy(0, 0));
        (spawnedBase.find(e => e instanceof ChainLightning) as ChainLightning).update(0.01);
        expect(spawnedBase.some(e => e instanceof StaticFieldZone)).toBe(false);

        const evolved = new LightningChainWeapon(makeOwner());
        evolved.evolved = true;
        const spawnedEvo: any[] = [];
        evolved.onSpawn = (e: any) => spawnedEvo.push(e);
        evolved.fire(makeEnemy(0, 0));
        // The opening sky bolt already counts as an impact
        (spawnedEvo.find(e => e instanceof ChainLightning) as ChainLightning).update(0.01);
        expect(spawnedEvo.some(e => e instanceof StaticFieldZone)).toBe(true);
    });
});

describe('ChainLightning', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hops one enemy at a time instead of resolving in a single frame', () => {
        const enemies = [makeEnemy(10, 0), makeEnemy(20, 0), makeEnemy(30, 0)];
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies as any);

        const chain = new ChainLightning(0, 0, 100, 3);
        chain.hopInterval = 0.1;
        const hits: any[] = [];
        chain.onHit = (t) => hits.push(t);

        chain.update(0.05);          // sky bolt only, no hop yet
        expect(hits).toHaveLength(0);

        chain.update(0.05);          // first hop
        expect(hits).toHaveLength(1);

        chain.update(0.1);
        expect(hits).toHaveLength(2);
    });

    it('never hits the same enemy twice and stops when nothing is left', () => {
        const enemies = [makeEnemy(10, 0), makeEnemy(20, 0)];
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies as any);

        const chain = new ChainLightning(0, 0, 100, 8);
        chain.hopInterval = 0.01;
        const hits: any[] = [];
        chain.onHit = (t) => hits.push(t);

        chain.update(1);
        expect(hits).toHaveLength(2);
        expect(new Set(hits).size).toBe(2);
        expect(chain.bounces).toBe(0);
    });

    it('respects the total chain length budget', () => {
        const enemies = [makeEnemy(100, 0), makeEnemy(200, 0), makeEnemy(300, 0)];
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies as any);

        const chain = new ChainLightning(0, 0, 100, 8, 150);
        chain.chainRange = 400;
        chain.hopInterval = 0.01;
        const hits: any[] = [];
        chain.onHit = (t) => hits.push(t);

        chain.update(1);
        // 0→100 fits in the 150 budget, 100→200 does not
        expect(hits).toHaveLength(1);
    });

    it('applies damage falloff per hop', () => {
        const enemies = [makeEnemy(10, 0), makeEnemy(20, 0)];
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies as any);

        const chain = new ChainLightning(0, 0, 100, 4);
        chain.hopInterval = 0.01;
        chain.damageFalloff = 0.5;
        const damages: number[] = [];
        chain.onHit = (_t, d) => damages.push(d);

        chain.update(1);
        expect(damages[0]).toBeCloseTo(50);
        expect(damages[1]).toBeCloseTo(25);
    });

    it('dies once the chain is spent and the arcs have faded', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
        const chain = new ChainLightning(0, 0, 100, 4);

        chain.update(0.016);
        expect(chain.isDead).toBe(false);
        chain.update(1);
        expect(chain.isDead).toBe(true);
    });

    it('does not damage anything by itself — damage flows through onHit', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
        const chain = new ChainLightning(0, 0, 100, 4);
        chain.update(0.1);
        expect(damageSystem.dealDamage).not.toHaveBeenCalled();
    });
});
