/**
 * Тесты поведения конкретных реализаций оружия
 *
 * Проверяют:
 * 1. VoidRayWeapon - создание SweepingLance, выбор дальних целей
 * 2. PlasmaCannonWeapon - создание PlasmaProjectile, эволюция = афтершоки
 * 3. AcidPoolWeapon - создание LobbedProjectile → AcidZone
 * 4. ChronoDiscWeapon - создание BouncingProjectile
 * 5. LightningChainWeapon - создание ChainLightning
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies first
vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => [])
    }
}));

vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitHit: vi.fn(),
        emitPoison: vi.fn(),
        emitPlasmaEnergy: vi.fn(),
        emitSingularityDistortion: vi.fn(),
        emitLightning: vi.fn(),
        emitPlasmaBurst: vi.fn(),
        emitAcidBubble: vi.fn(),
        emitBeamCharge: vi.fn(),
        emitTrail: vi.fn()
    }
}));

vi.mock('../core/JuiceSystem', () => ({
    juice: {
        shockwave: vi.fn(),
        addTrauma: vi.fn(),
        hitStop: vi.fn(),
        flash: vi.fn(),
        zoomPunch: vi.fn(),
    }
}));

vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealRawDamage: vi.fn(),
        dealDamage: vi.fn(() => ({ finalDamage: 10, isCrit: false }))
    }
}));

import { levelSpatialHash } from '../core/SpatialHash';
import { VoidRayWeapon, SweepingLance } from '../weapons/implementations/VoidRayWeapon';
import { PlasmaCannonWeapon } from '../weapons/implementations/PlasmaCannonWeapon';
import { AcidPoolWeapon } from '../weapons/implementations/AcidPoolWeapon';
import { ChronoDiscWeapon } from '../weapons/implementations/ChronoDiscWeapon';
import { LightningChainWeapon } from '../weapons/implementations/LightningChainWeapon';
import { PlasmaProjectile, BouncingProjectile } from '../weapons/base/Projectile';
import { AcidZone, PlasmaExplosionZone } from '../weapons/base/Zone';

// Mock owner
const createMockOwner = () => ({
    pos: { x: 100, y: 100 },
    stats: {
        damage: 1, cooldown: 1, area: 1, speed: 1, duration: 1,
        amount: 1, moveSpeed: 1, magnet: 1, luck: 1
    },
    getDamage: (d: number) => ({ damage: d, isCrit: false })
});

// Mock enemy
const createMockEnemy = (x: number, y: number) => ({
    pos: { x, y },
    isDead: false
});

describe('VoidRayWeapon', () => {
    let weapon: VoidRayWeapon;
    let mockOwner: any;
    let spawnedEntities: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        mockOwner = createMockOwner();
        weapon = new VoidRayWeapon(mockOwner);
        spawnedEntities = [];
        weapon.onSpawn = (e) => spawnedEntities.push(e);
    });

    it('should initialize with correct stats from weapon stats object', () => {
        expect(weapon.damage).toBe(40);
        expect(weapon.baseCooldown).toBe(2.0);
    });

    it('should fire a SweepingLance when enemy in range and cooldown ready', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(1);
        expect(spawnedEntities[0]).toBeInstanceOf(SweepingLance);
        expect((spawnedEntities[0] as any).source).toBe(weapon);
    });

    it('should NOT fire when no enemy in range', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(0);
    });

    it('should NOT fire when cooldown not ready', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 1;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(0);
    });

    it('sweeps through further enemies rather than the nearest one', () => {
        // The sweep deliberately skips anything inside SWEEP_MIN_REACH: dragging
        // the beam onto a body already touching the last one is invisible
        const near = createMockEnemy(200, 100);   // 100px from the owner
        const far = createMockEnemy(200, 400);    // 300px from `near`
        const tooClose = createMockEnemy(230, 110);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([near, far, tooClose]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        const lance = spawnedEntities[0] as any;
        // owner -> near -> far, with the body 30px off `near` passed over
        expect(lance.nodes).toHaveLength(3);
        expect(lance.nodes[2]).toEqual({ x: far.pos.x, y: far.pos.y });
    });

    it('takes longer to recharge when evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        for (let i = 0; i < 5; i++) weapon.upgrade();
        expect(weapon.evolved).toBe(true);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(weapon.cooldown).toBeCloseTo(weapon.baseCooldown * mockOwner.stats.cooldown * 1.35);
    });

    it('should reset cooldown after firing', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(weapon.cooldown).toBe(weapon.baseCooldown * mockOwner.stats.cooldown);
    });
});

describe('PlasmaCannonWeapon', () => {
    let weapon: PlasmaCannonWeapon;
    let mockOwner: any;
    let spawnedEntities: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        mockOwner = createMockOwner();
        weapon = new PlasmaCannonWeapon(mockOwner);
        spawnedEntities = [];
        weapon.onSpawn = (e) => spawnedEntities.push(e);
    });

    it('should initialize with correct stats', () => {
        expect(weapon.damage).toBe(40);
        expect(weapon.baseCooldown).toBe(2.5);
        expect(weapon.speed).toBe(200);
    });

    it('should fire PlasmaProjectile when enemy in range', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(1);
        expect(spawnedEntities[0]).toBeInstanceOf(PlasmaProjectile);
        expect((spawnedEntities[0] as any).source).toBe(weapon);
    });

    it('detonates into shards at both tiers, not only when evolved', () => {
        // The round used to be pure travel until it exploded at maximum range;
        // both tiers now burst so it works at the range you actually fight at
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        const plasma = spawnedEntities[0] as PlasmaProjectile;
        expect(plasma.onExplosion).toBeDefined();

        spawnedEntities.length = 0;
        plasma.onExplosion!(0, 0);
        expect(spawnedEntities.length).toBeGreaterThan(0);
        // Base tier bursts, but the crater does not keep erupting
        expect(spawnedEntities.some(e => e instanceof PlasmaExplosionZone)).toBe(false);
    });

    it('bursts on the first body it touches instead of piercing a column', () => {
        // The round used to pierce 999 enemies and only detonate at maximum
        // flight distance, which put the payoff behind the fight
        expect(weapon.pierce).toBe(0);
    });

    it('rolls three delayed aftershocks out of the crater when evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        for (let i = 0; i < 5; i++) weapon.upgrade();

        weapon.cooldown = 0;
        weapon.update(0.1);

        const plasma = spawnedEntities[0] as PlasmaProjectile;
        expect(plasma.onExplosion).toBeDefined();

        spawnedEntities.length = 0;
        plasma.onExplosion!(100, 100);

        const waves = spawnedEntities.filter(
            e => e instanceof PlasmaExplosionZone && (e as any).detonationDelay > 0
        );
        expect(waves).toHaveLength(3);
        // One per second, each wider than the last
        expect(waves.map(w => (w as any).detonationDelay)).toEqual([1, 2, 3]);
        expect(waves[2].radius).toBeGreaterThan(waves[0].radius);
    });

    it('should have longer cooldown when evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        for (let i = 0; i < 5; i++) weapon.upgrade();

        weapon.cooldown = 0;
        weapon.update(0.1);

        // Evolved cooldown multiplier is 1.4
        expect(weapon.cooldown).toBeCloseTo(weapon.baseCooldown * mockOwner.stats.cooldown * 1.4);
    });
});

describe('AcidPoolWeapon', () => {
    let weapon: AcidPoolWeapon;
    let mockOwner: any;
    let spawnedEntities: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        mockOwner = createMockOwner();
        weapon = new AcidPoolWeapon(mockOwner);
        spawnedEntities = [];
        weapon.onSpawn = (e) => spawnedEntities.push(e);
    });

    it('should create LobbedProjectile when enemy in range', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(1);
        // LobbedProjectile has onLand callback
        expect(spawnedEntities[0].onLand).toBeDefined();
        expect((spawnedEntities[0] as any).source).toBe(weapon);
    });

    it('should create AcidZone on land', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        const lobbed = spawnedEntities[0];
        lobbed.onLand(250, 150);

        // AcidZone should be spawned
        expect(spawnedEntities.length).toBe(2);
        expect(spawnedEntities[1]).toBeInstanceOf(AcidZone);
        expect((spawnedEntities[1] as any).source).toBe(weapon);
    });

    it('should create AcidZone with correct area', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);
        mockOwner.stats.area = 1.5;

        weapon.cooldown = 0;
        weapon.update(0.1);

        const lobbed = spawnedEntities[0];
        lobbed.onLand(250, 150);

        const zone = spawnedEntities[1] as AcidZone;
        // `radius` starts at the seed and eases outward, so the settled size
        // is the one to assert (see Zone.spreadIn)
        expect(zone.fullRadius).toBeCloseTo(weapon.area * 1.5);
        expect(zone.radius).toBeLessThan(zone.fullRadius);
    });

    it('the puddle spreads out from where the flask broke', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);
        spawnedEntities[0].onLand(250, 150);

        const zone = spawnedEntities[1] as AcidZone;
        const seeded = zone.radius;
        for (let i = 0; i < 30; i++) zone.update(1 / 60);
        expect(zone.radius).toBeGreaterThan(seeded);
        expect(zone.radius).toBeCloseTo(zone.fullRadius);
    });
});

describe('ChronoDiscWeapon', () => {
    let weapon: ChronoDiscWeapon;
    let mockOwner: any;
    let spawnedEntities: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        mockOwner = createMockOwner();
        weapon = new ChronoDiscWeapon(mockOwner);
        spawnedEntities = [];
        weapon.onSpawn = (e) => spawnedEntities.push(e);
    });

    it('should create BouncingProjectile when enemy in range', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(1);
        expect(spawnedEntities[0]).toBeInstanceOf(BouncingProjectile);
    });

    it('should create more discs at higher levels', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        // Level up to increase count
        weapon.upgrade(); // level 2
        // count = 1 + floor((2-1) * 1) = 1 + 1 = 2

        weapon.cooldown = 0;
        weapon.update(0.1); // First disc fires immediately

        expect(spawnedEntities.length).toBe(1); // First disc

        // Second disc is in pendingDiscs with 0.2s delay
        weapon.update(0.3); // Enough time for pending disc

        expect(spawnedEntities.length).toBe(2); // Both discs
    });

    it('should have correct number of bounces based on level', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        const disc = spawnedEntities[0] as BouncingProjectile;
        // bounces = pierce (5) + level (1) = 6
        expect(disc.bouncesLeft).toBe(6);
    });
});

describe('LightningChainWeapon', () => {
    let weapon: LightningChainWeapon;
    let mockOwner: any;
    let spawnedEntities: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        mockOwner = createMockOwner();
        weapon = new LightningChainWeapon(mockOwner);
        spawnedEntities = [];
        weapon.onSpawn = (e) => spawnedEntities.push(e);
    });

    it('should create ChainLightning when enemy in range', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        // Only the chain spawns — the old player-to-target beam is gone
        expect(spawnedEntities).toHaveLength(1);
        expect(spawnedEntities[0].segments).toBeDefined();
    });

    it('should use findClosestEnemy for targeting', () => {
        const enemy1 = createMockEnemy(300, 100); // farther
        const enemy2 = createMockEnemy(150, 100); // closer
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy1, enemy2]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(1);
        // The chain starts on the closer enemy
        expect(spawnedEntities[0].pos.x).toBe(150);
    });

    it('should NOT fire when no enemy in range', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(0);
    });
});
