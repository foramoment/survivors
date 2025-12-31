/**
 * Тесты для базового класса Weapon
 *
 * Проверяют:
 * 1. upgrade() - повышение уровня, скейлинг урона, evolved на уровне 6+
 * 2. findClosestEnemy() - поиск ближайшего врага
 * 3. findRandomEnemies() - поиск случайных врагов
 * 4. findAllEnemies() - поиск всех врагов
 * 5. calculateVelocityToTarget() - расчёт скорости к цели
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Weapon } from '../Weapon';
import type { Vector2 } from '../core/Utils';

// Mock SpatialHash
vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => [])
    }
}));

import { levelSpatialHash } from '../core/SpatialHash';

// Concrete weapon for testing abstract class
class TestWeapon extends Weapon {
    name = 'Test Weapon';
    emoji = '🔫';
    description = 'A test weapon';

    constructor(owner: any) {
        super(owner);
        this.damage = 100;
        this.baseCooldown = 1.0;
        this.area = 200;
        this.speed = 500;
        this.duration = 2;
    }

    update(_dt: number) { }
    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// Mock owner
const createMockOwner = (overrides: Partial<any> = {}) => ({
    pos: { x: 100, y: 100 },
    stats: {
        damage: 1, cooldown: 1, area: 1, speed: 1, duration: 1,
        amount: 1, moveSpeed: 1, magnet: 1, luck: 1,
        ...overrides.stats
    },
    getDamage: (d: number) => ({ damage: d, isCrit: false }),
    ...overrides
});

// Mock enemy
const createMockEnemy = (x: number, y: number) => ({
    pos: { x, y },
    isDead: false
});

describe('Weapon Base Class', () => {
    let weapon: TestWeapon;
    let mockOwner: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOwner = createMockOwner();
        weapon = new TestWeapon(mockOwner);
    });

    describe('constructor', () => {
        it('should initialize with level 1', () => {
            expect(weapon.level).toBe(1);
        });

        it('should initialize as not evolved', () => {
            expect(weapon.evolved).toBe(false);
        });

        it('should set owner reference', () => {
            expect(weapon.owner).toBe(mockOwner);
        });
    });

    describe('upgrade()', () => {
        it('should increment level', () => {
            weapon.upgrade();
            expect(weapon.level).toBe(2);
        });

        it('should apply damage scaling', () => {
            const initialDamage = weapon.damage;
            weapon.upgrade();
            expect(weapon.damage).toBe(initialDamage * weapon['damageScaling']);
        });

        it('should NOT set evolved at level < 6', () => {
            for (let i = 0; i < 4; i++) {
                weapon.upgrade();
            }
            expect(weapon.level).toBe(5);
            expect(weapon.evolved).toBe(false);
        });

        it('should set evolved at level 6', () => {
            for (let i = 0; i < 5; i++) {
                weapon.upgrade();
            }
            expect(weapon.level).toBe(6);
            expect(weapon.evolved).toBe(true);
        });

        it('should maintain evolved status after level 6', () => {
            for (let i = 0; i < 6; i++) {
                weapon.upgrade();
            }
            expect(weapon.level).toBe(7);
            expect(weapon.evolved).toBe(true);
        });

        it('should stack damage scaling on multiple upgrades', () => {
            const initialDamage = weapon.damage;
            const scaling = weapon['damageScaling'];
            weapon.upgrade();
            weapon.upgrade();
            weapon.upgrade();
            expect(weapon.damage).toBeCloseTo(initialDamage * scaling * scaling * scaling);
        });
    });

    describe('findClosestEnemy()', () => {
        it('should return null when no enemies found', () => {
            vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
            const result = weapon['findClosestEnemy']();
            expect(result).toBeNull();
        });

        it('should return closest enemy', () => {
            const enemy1 = createMockEnemy(150, 100); // distance = 50
            const enemy2 = createMockEnemy(200, 100); // distance = 100
            const enemy3 = createMockEnemy(130, 100); // distance = 30 - closest

            vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy1, enemy2, enemy3]);

            const result = weapon['findClosestEnemy']();
            expect(result).toBe(enemy3);
        });

        it('should use specified maxRange', () => {
            weapon['findClosestEnemy'](500);
            expect(levelSpatialHash.getWithinRadius).toHaveBeenCalledWith(
                mockOwner.pos,
                500
            );
        });

        it('should use area * stats.area when maxRange not specified', () => {
            weapon['findClosestEnemy']();
            expect(levelSpatialHash.getWithinRadius).toHaveBeenCalledWith(
                mockOwner.pos,
                weapon.area * mockOwner.stats.area
            );
        });
    });

    describe('findRandomEnemies()', () => {
        it('should return empty array when no enemies found', () => {
            vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
            const result = weapon['findRandomEnemies'](3);
            expect(result).toHaveLength(0);
        });

        it('should return requested count of enemies', () => {
            const enemies = [
                createMockEnemy(150, 100),
                createMockEnemy(200, 100),
                createMockEnemy(130, 100),
                createMockEnemy(180, 100),
            ];
            vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies);

            const result = weapon['findRandomEnemies'](2);
            expect(result).toHaveLength(2);
        });

        it('should return all enemies if count exceeds available', () => {
            const enemies = [createMockEnemy(150, 100), createMockEnemy(200, 100)];
            vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies);

            const result = weapon['findRandomEnemies'](10);
            expect(result).toHaveLength(2);
        });
    });

    describe('findAllEnemies()', () => {
        it('should return all enemies in range', () => {
            const enemies = [
                createMockEnemy(150, 100),
                createMockEnemy(200, 100),
                createMockEnemy(130, 100),
            ];
            vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(enemies);

            const result = weapon['findAllEnemies']();
            expect(result).toHaveLength(3);
        });
    });

    describe('calculateVelocityToTarget()', () => {
        it('should calculate velocity toward target', () => {
            const target = createMockEnemy(200, 100); // Target is 100 units to the right
            const velocity = weapon['calculateVelocityToTarget'](target as any);

            // Direction should be (1, 0) - directly right
            // Speed = 500 * 1 (stats.speed) = 500
            expect(velocity.x).toBeCloseTo(500);
            expect(velocity.y).toBeCloseTo(0);
        });

        it('should normalize direction for diagonal targets', () => {
            const target = createMockEnemy(200, 200); // Target is 100 units right & down
            const velocity = weapon['calculateVelocityToTarget'](target as any);

            // Diagonal, so each component should be ~354 (500 / sqrt(2))
            const expectedSpeed = 500 / Math.sqrt(2);
            expect(velocity.x).toBeCloseTo(expectedSpeed);
            expect(velocity.y).toBeCloseTo(expectedSpeed);
        });

        it('should apply owner stats.speed multiplier', () => {
            mockOwner.stats.speed = 1.5;
            const target = createMockEnemy(200, 100);
            const velocity = weapon['calculateVelocityToTarget'](target as any);

            expect(velocity.x).toBeCloseTo(750); // 500 * 1.5
        });
    });

    describe('callbacks', () => {
        it('should have default no-op onSpawn callback', () => {
            expect(() => weapon.onSpawn({} as any)).not.toThrow();
        });

        it('should allow setting custom onSpawn callback', () => {
            let spawned = false;
            weapon.onSpawn = () => { spawned = true; };
            weapon.onSpawn({} as any);
            expect(spawned).toBe(true);
        });
    });
});
