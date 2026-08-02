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
        emitZoneEdge: vi.fn(),
        emitShrapnel: vi.fn(),
        emitColdMist: vi.fn(),
        emitSporeCloud: vi.fn(),
        emitFrost: vi.fn(),
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
        // Base tier bursts, but its shards do not burst again
        expect(spawnedEntities.every((s: any) => s.splinters === 0)).toBe(true);
    });

    it('bursts on the first body it touches instead of piercing a column', () => {
        // The round used to pierce 999 enemies and only detonate at maximum
        // flight distance, which put the payoff behind the fight
        expect(weapon.pierce).toBe(0);
    });

    it('evolved shards burst into more shards, exactly two generations deep', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        for (let i = 0; i < 5; i++) weapon.upgrade();

        weapon.cooldown = 0;
        weapon.update(0.1);

        const plasma = spawnedEntities[0] as PlasmaProjectile;
        spawnedEntities.length = 0;
        plasma.onExplosion!(100, 100);

        // Copy: `spawnedEntities` is cleared below and `first` must survive it
        const first = [...spawnedEntities] as any[];
        expect(first.length).toBe(8);
        expect(first.every(s => s.splinters === 1)).toBe(true);

        // A shard biting into a body seeds the next spray from that body
        spawnedEntities.length = 0;
        first[0].handleHit({ pos: { x: 300, y: 300 }, isDead: false } as any);

        const second = [...spawnedEntities] as any[];
        expect(second.length).toBe(6);
        expect(second[0].pos).toEqual({ x: 300, y: 300 });
        // ...and the children cannot cascade
        expect(second.every(s => s.splinters === 0)).toBe(true);
        expect(second[0].damage).toBeLessThan(first[0].damage);
    });

    it('should have longer cooldown when evolved', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        for (let i = 0; i < 5; i++) weapon.upgrade();

        weapon.cooldown = 0;
        weapon.update(0.1);

        // Evolved cooldown multiplier is 1.2 — the evolution already pays in a
        // condition (a shard has to connect), so it should not also pay in rate
        expect(weapon.cooldown).toBeCloseTo(weapon.baseCooldown * mockOwner.stats.cooldown * 1.2);
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
        // `radius` starts small and creeps outward, so the configured size is
        // the one to assert (see Zone.growOver)
        expect(zone.baseRadius).toBeCloseTo(weapon.area * 1.5);
        expect(zone.radius).toBeLessThan(zone.baseRadius);
    });

    it('the puddle keeps creeping for its whole life, not for a moment', () => {
        const enemy = createMockEnemy(200, 100);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        weapon.cooldown = 0;
        weapon.update(0.1);
        spawnedEntities[0].onLand(250, 150);

        const zone = spawnedEntities[1] as AcidZone;
        const seeded = zone.radius;

        // Half a second in it has barely moved — the growth is not a 0.3s pop
        for (let i = 0; i < 30; i++) zone.update(1 / 60);
        const early = zone.radius;
        expect(early).toBeGreaterThan(seeded);
        expect(early).toBeLessThan(zone.baseRadius * 0.65);

        // It only reaches full size as it dies
        while (!zone.isDead) zone.update(1 / 60);
        expect(zone.radius).toBeCloseTo(zone.baseRadius, 0);
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
