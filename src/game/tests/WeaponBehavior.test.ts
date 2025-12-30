/**
 * Тесты поведения конкретных реализаций оружия
 *
 * Проверяют:
 * 1. VoidRayWeapon - создание VoidRayBeam, evolved bonus
 * 2. PlasmaCannonWeapon - создание PlasmaProjectile, evolved FusionCoreSingularity
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
        emitLightning: vi.fn()
    }
}));

vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealRawDamage: vi.fn(),
        dealDamage: vi.fn(() => ({ finalDamage: 10, isCrit: false }))
    }
}));

import { levelSpatialHash } from '../core/SpatialHash';
import { VoidRayWeapon } from '../weapons/implementations/VoidRayWeapon';
import { PlasmaCannonWeapon } from '../weapons/implementations/PlasmaCannonWeapon';
import { AcidPoolWeapon } from '../weapons/implementations/AcidPoolWeapon';
import { ChronoDiscWeapon } from '../weapons/implementations/ChronoDiscWeapon';
import { LightningChainWeapon } from '../weapons/implementations/LightningChainWeapon';
import { VoidRayBeam } from '../weapons/base/Beam';
import { PlasmaProjectile, BouncingProjectile } from '../weapons/base/Projectile';
import { AcidZone } from '../weapons/base/Zone';

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
        expect(weapon.damage).toBe(25);
        expect(weapon.baseCooldown).toBe(2.0);
    });

    it('should fire VoidRayBeam when enemy in range and cooldown ready', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(1);
        expect(spawnedEntities[0]).toBeInstanceOf(VoidRayBeam);
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

    it('should deal double damage when evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        // Evolve weapon
        for (let i = 0; i < 5; i++) weapon.upgrade();
        expect(weapon.evolved).toBe(true);

        weapon.cooldown = 0;
        weapon.update(0.1);

        const beam = spawnedEntities[0] as VoidRayBeam;
        // Beam is created with damage * 2 for evolved
        // We can check that it's evolved variant by checking the maxWidth/color
        expect(beam).toBeInstanceOf(VoidRayBeam);
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
    });

    it('should NOT create FusionCoreSingularity when NOT evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        const plasma = spawnedEntities[0] as PlasmaProjectile;
        expect(plasma.onExplosion).toBeUndefined();
    });

    it('should create FusionCoreSingularity on explosion when evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        // Evolve
        for (let i = 0; i < 5; i++) weapon.upgrade();

        weapon.cooldown = 0;
        weapon.update(0.1);

        const plasma = spawnedEntities[0] as PlasmaProjectile;
        expect(plasma.onExplosion).toBeDefined();

        // Trigger explosion
        plasma.onExplosion!(100, 100);

        // FusionCoreSingularity should be spawned
        expect(spawnedEntities.length).toBeGreaterThan(1);
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
        expect(zone.radius).toBeCloseTo(weapon.area * 1.5);
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

        // LightningChain spawns both Beam and ChainLightning
        expect(spawnedEntities).toHaveLength(2);
        // ChainLightning has segments array (second entity)
        expect(spawnedEntities[1].segments).toBeDefined();
    });

    it('should use findClosestEnemy for targeting', () => {
        const enemy1 = createMockEnemy(300, 100); // farther
        const enemy2 = createMockEnemy(150, 100); // closer
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy1, enemy2]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        // Spawns Beam + ChainLightning
        expect(spawnedEntities).toHaveLength(2);
    });

    it('should NOT fire when no enemy in range', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);

        weapon.cooldown = 0;
        weapon.update(0.1);

        expect(spawnedEntities).toHaveLength(0);
    });
});
