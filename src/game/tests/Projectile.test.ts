/**
 * Тесты для базовых классов снарядов (Projectile)
 *
 * Проверяют:
 * 1. Projectile - движение, длительность, isDead
 * 2. BouncingProjectile - отскоки, canHit, markHit
 * 3. OrbitingProjectile - орбитальное движение
 * 4. LobbedProjectile - параболическая траектория, onLand
 * 5. PlasmaProjectile - onExplosion callback
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    Projectile,
    BouncingProjectile,
    OrbitingProjectile,
    LobbedProjectile,
    PlasmaProjectile
} from '../weapons/base/Projectile';

// Mock dependencies
vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitSingularityDistortion: vi.fn(),
        emitPlasmaEnergy: vi.fn()
    }
}));

vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => [])
    }
}));

describe('Projectile', () => {
    describe('movement and lifetime', () => {
        it('should move based on velocity', () => {
            const proj = new Projectile(0, 0, { x: 100, y: 50 }, 1, 10, 1, '🔴');

            proj.update(0.5); // 0.5 seconds

            expect(proj.pos.x).toBeCloseTo(50);  // 100 * 0.5
            expect(proj.pos.y).toBeCloseTo(25);  // 50 * 0.5
        });

        it('should decrease duration on update', () => {
            const proj = new Projectile(0, 0, { x: 0, y: 0 }, 2, 10, 1, '🔴');

            proj.update(0.5);

            expect(proj.duration).toBeCloseTo(1.5);
        });

        it('should set isDead when duration expires', () => {
            const proj = new Projectile(0, 0, { x: 0, y: 0 }, 1, 10, 1, '🔴');

            proj.update(1.5);

            expect(proj.isDead).toBe(true);
        });

        it('should NOT be dead until duration expires', () => {
            const proj = new Projectile(0, 0, { x: 0, y: 0 }, 2, 10, 1, '🔴');

            proj.update(0.5);

            expect(proj.isDead).toBe(false);
        });
    });

    describe('initial state', () => {
        it('should initialize with correct properties', () => {
            const proj = new Projectile(10, 20, { x: 100, y: 200 }, 3, 50, 5, '💫');

            expect(proj.pos.x).toBe(10);
            expect(proj.pos.y).toBe(20);
            expect(proj.velocity.x).toBe(100);
            expect(proj.velocity.y).toBe(200);
            expect(proj.duration).toBe(3);
            expect(proj.damage).toBe(50);
            expect(proj.pierce).toBe(5);
            expect(proj.emoji).toBe('💫');
            expect(proj.canCollide).toBe(true);
        });
    });
});

describe('BouncingProjectile', () => {
    it('should track hit enemies', () => {
        const proj = new BouncingProjectile(0, 0, { x: 100, y: 0 }, 2, 10, 3, '💿');
        const enemy = { id: 1 };

        expect(proj.canHit(enemy)).toBe(true);

        proj.markHit(enemy);

        expect(proj.canHit(enemy)).toBe(false);
    });

    it('should allow hitting new enemies after bounce', () => {
        const proj = new BouncingProjectile(0, 0, { x: 100, y: 0 }, 2, 10, 3, '💿');
        const enemy1 = { id: 1 };
        const enemy2 = { id: 2 };

        proj.markHit(enemy1);

        expect(proj.canHit(enemy1)).toBe(false);
        expect(proj.canHit(enemy2)).toBe(true);
    });

    it('should change direction on bounce', () => {
        const proj = new BouncingProjectile(0, 0, { x: 100, y: 0 }, 2, 10, 3, '💿');

        proj.bounce({ x: 0, y: 100 }); // Target above

        // Direction should now be upward instead of rightward
        expect(proj.velocity.y).toBeCloseTo(100);
        expect(proj.bouncesLeft).toBe(2);
    });

    it('should maintain speed on bounce', () => {
        const proj = new BouncingProjectile(0, 0, { x: 300, y: 400 }, 2, 10, 3, '💿');
        const originalSpeed = Math.sqrt(300 ** 2 + 400 ** 2); // 500

        proj.bounce({ x: 100, y: 0 });

        const newSpeed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
        expect(newSpeed).toBeCloseTo(originalSpeed);
    });

    it('should decrement bounces left on bounce', () => {
        const proj = new BouncingProjectile(0, 0, { x: 100, y: 0 }, 2, 10, 5, '💿');

        proj.bounce({ x: 0, y: 100 });

        expect(proj.bouncesLeft).toBe(4);
    });
});

describe('OrbitingProjectile', () => {
    let mockOwner: any;

    beforeEach(() => {
        mockOwner = {
            pos: { x: 100, y: 100 }
        };
    });

    it('should orbit around owner', () => {
        const proj = new OrbitingProjectile(mockOwner, 50, 1, 5, 10, '🔥');

        // After first update, position should be on the orbit
        proj.update(0); // Initialize position on orbit
        const distFromOwner = Math.sqrt(
            (proj.pos.x - mockOwner.pos.x) ** 2 +
            (proj.pos.y - mockOwner.pos.y) ** 2
        );
        expect(distFromOwner).toBeCloseTo(50);

        proj.update(Math.PI); // Rotate half circle

        // Should still be on orbital distance
        const newDist = Math.sqrt(
            (proj.pos.x - mockOwner.pos.x) ** 2 +
            (proj.pos.y - mockOwner.pos.y) ** 2
        );
        expect(newDist).toBeCloseTo(50);
    });

    it('should follow owner when owner moves', () => {
        const proj = new OrbitingProjectile(mockOwner, 50, 1, 5, 10, '🔥');

        mockOwner.pos = { x: 500, y: 500 };
        proj.update(0.1);

        // After update, projectile should orbit around new owner position
        const distFromOwner = Math.sqrt(
            (proj.pos.x - mockOwner.pos.x) ** 2 +
            (proj.pos.y - mockOwner.pos.y) ** 2
        );
        expect(distFromOwner).toBeCloseTo(50);
    });

    it('should die when duration expires', () => {
        const proj = new OrbitingProjectile(mockOwner, 50, 1, 1, 10, '🔥');

        proj.update(1.5);

        expect(proj.isDead).toBe(true);
    });
});

describe('LobbedProjectile', () => {
    it('should move toward target', () => {
        const proj = new LobbedProjectile(0, 0, { x: 100, y: 0 }, 1, '🧪');

        proj.update(0.5); // Halfway

        expect(proj.pos.x).toBeCloseTo(50);
    });

    it('should call onLand when reaching target', () => {
        const onLand = vi.fn();
        const proj = new LobbedProjectile(0, 0, { x: 100, y: 50 }, 1, '🧪');
        proj.onLand = onLand;

        proj.update(1.5); // Past duration

        expect(onLand).toHaveBeenCalledWith(100, 50);
        expect(proj.isDead).toBe(true);
    });

    it('should NOT collide during flight', () => {
        const proj = new LobbedProjectile(0, 0, { x: 100, y: 0 }, 1, '🧪');

        expect(proj.canCollide).toBe(false);
    });

    it('should follow arc trajectory (has height offset)', () => {
        const proj = new LobbedProjectile(0, 0, { x: 100, y: 0 }, 1, '🧪');

        proj.update(0.5); // At peak of arc

        // At halfway point, Y should be offset by arc height
        // Base Y = 0, target Y = 0, so horizontal path
        // But arc adds height, so Y < 0 at midpoint
        expect(proj.pos.y).toBeLessThan(0);
    });
});

describe('PlasmaProjectile', () => {
    it('should call onExplosion when dying', () => {
        const onExplosion = vi.fn();
        const proj = new PlasmaProjectile(50, 75, { x: 100, y: 0 }, 1, 25, 1);
        proj.onExplosion = onExplosion;

        // Simulate projectile dying
        proj.update(1.5);

        expect(onExplosion).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number)
        );
    });

    it('should NOT call onExplosion while alive', () => {
        const onExplosion = vi.fn();
        const proj = new PlasmaProjectile(0, 0, { x: 100, y: 0 }, 2, 25, 1);
        proj.onExplosion = onExplosion;

        proj.update(0.5); // Still alive

        expect(onExplosion).not.toHaveBeenCalled();
    });
});
