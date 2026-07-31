import { describe, it, expect, vi } from 'vitest';

vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitLightning: vi.fn(),
        emit: vi.fn(),
        emitHit: vi.fn(),
    },
}));

vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealDamage: vi.fn(),
        dealRawDamage: vi.fn(),
    },
}));

vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => []),
        getNearby: vi.fn(() => []),
    },
}));

import { LightningChainWeapon } from '../weapons/implementations/LightningChainWeapon';
import { ChainLightning } from '../weapons/base';

function makeOwner(): any {
    return {
        pos: { x: 0, y: 0 },
        stats: { might: 1, area: 1, cooldown: 1, speed: 1, duration: 1 },
        weapons: [],
    };
}

function fireAndGetChain(weapon: LightningChainWeapon): ChainLightning {
    const spawned: any[] = [];
    weapon.onSpawn = (e: any) => spawned.push(e);
    weapon.fire({ pos: { x: 10, y: 10 } });
    const chain = spawned.find(e => e instanceof ChainLightning);
    expect(chain).toBeDefined();
    return chain as ChainLightning;
}

describe('LightningChainWeapon performance caps', () => {
    it('evolved chain is bounded (no more 999-bounce map-wide chains)', () => {
        const weapon = new LightningChainWeapon(makeOwner());
        weapon.evolved = true;
        const chain = fireAndGetChain(weapon);
        expect(chain.bounces).toBeLessThanOrEqual(24);
        expect(chain.maxChainLength).toBeLessThanOrEqual(4000);
    });

    it('base chain bounces are capped even at high weapon level', () => {
        const weapon = new LightningChainWeapon(makeOwner());
        weapon.level = 20;
        const chain = fireAndGetChain(weapon);
        expect(chain.bounces).toBeLessThanOrEqual(12);
    });
});
