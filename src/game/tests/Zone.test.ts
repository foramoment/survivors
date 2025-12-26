/**
 * Тесты для базовых классов зон (Zone)
 *
 * Проверяют:
 * 1. Zone - длительность, таймер урона, slowEffect
 * 2. NanobotCloud - следование за owner
 * 3. DelayedExplosionZone - задержка, взрыв, урон врагам
 * 4. MindBlastZone - фазы (warning → charge → blast), урон, stun
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Zone, NanobotCloud, DelayedExplosionZone, MindBlastZone } from '../weapons/base/Zone';

// Mock dependencies
vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitNanoSwarm: vi.fn(),
        emitOrbitalStrike: vi.fn(),
        emitNuclear: vi.fn(),
        emitPsionicCharge: vi.fn(),
        emitPsionicWave: vi.fn(),
        emitHit: vi.fn()
    }
}));

vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => [])
    }
}));

vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealRawDamage: vi.fn()
    }
}));

import { levelSpatialHash } from '../core/SpatialHash';
import { damageSystem } from '../core/DamageSystem';

describe('Zone', () => {
    describe('lifetime', () => {
        it('should decrease duration on update', () => {
            const zone = new Zone(0, 0, 50, 5, 10, 0.5, '☢️');

            zone.update(1);

            expect(zone.duration).toBeCloseTo(4);
        });

        it('should set isDead when duration expires', () => {
            const zone = new Zone(0, 0, 50, 1, 10, 0.5, '☢️');

            zone.update(1.5);

            expect(zone.isDead).toBe(true);
        });

        it('should increment timer on update', () => {
            const zone = new Zone(0, 0, 50, 5, 10, 0.5, '☢️');

            zone.update(0.3);

            expect(zone.timer).toBeCloseTo(0.3);
        });
    });

    describe('slow effect', () => {
        it('should apply slow effect to enemy on overlap', () => {
            const zone = new Zone(0, 0, 50, 5, 10, 0.5, '❄️', 0.5);
            const enemy = { speedMultiplier: 1 };

            zone.onOverlap(enemy);

            expect(enemy.speedMultiplier).toBe(0.5); // 1 - 0.5 slow
        });

        it('should NOT slow below 0.1', () => {
            const zone = new Zone(0, 0, 50, 5, 10, 0.5, '❄️', 0.95);
            const enemy = { speedMultiplier: 1 };

            zone.onOverlap(enemy);

            expect(enemy.speedMultiplier).toBe(0.1); // Minimum
        });

        it('should NOT apply slow if slowEffect is 0', () => {
            const zone = new Zone(0, 0, 50, 5, 10, 0.5, '🔥', 0);
            const enemy = { speedMultiplier: 1 };

            zone.onOverlap(enemy);

            expect(enemy.speedMultiplier).toBe(1); // Unchanged
        });
    });

    describe('initial state', () => {
        it('should initialize with correct properties', () => {
            const zone = new Zone(100, 200, 75, 3, 25, 0.2, '💥', 0.3);

            expect(zone.pos.x).toBe(100);
            expect(zone.pos.y).toBe(200);
            expect(zone.radius).toBe(75);
            expect(zone.duration).toBe(3);
            expect(zone.damage).toBe(25);
            expect(zone.interval).toBe(0.2);
            expect(zone.emoji).toBe('💥');
            expect(zone.slowEffect).toBe(0.3);
        });
    });
});

describe('NanobotCloud', () => {
    let mockOwner: any;

    beforeEach(() => {
        mockOwner = { pos: { x: 100, y: 100 } };
    });

    it('should follow owner position', () => {
        const cloud = new NanobotCloud(mockOwner, 50, 5, 10, 0.5);

        expect(cloud.pos.x).toBe(100);
        expect(cloud.pos.y).toBe(100);

        mockOwner.pos = { x: 300, y: 400 };
        cloud.update(0.1);

        expect(cloud.pos.x).toBe(300);
        expect(cloud.pos.y).toBe(400);
    });

    it('should still decrease duration', () => {
        const cloud = new NanobotCloud(mockOwner, 50, 2, 10, 0.5);

        cloud.update(1);

        expect(cloud.duration).toBeCloseTo(1);
    });

    it('should die when duration expires', () => {
        const cloud = new NanobotCloud(mockOwner, 50, 1, 10, 0.5);

        cloud.update(1.5);

        expect(cloud.isDead).toBe(true);
    });
});

describe('DelayedExplosionZone', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should NOT explode before delay', () => {
        const zone = new DelayedExplosionZone(0, 0, 100, 1.0, 50, '💥');

        zone.update(0.5);

        expect(zone.exploded).toBe(false);
    });

    it('should explode after delay', () => {
        const zone = new DelayedExplosionZone(0, 0, 100, 1.0, 50, '💥');

        zone.update(1.1);

        expect(zone.exploded).toBe(true);
    });

    it('should damage enemies in blast radius', () => {
        const enemy = { pos: { x: 50, y: 0 } }; // Within 100 radius
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        const zone = new DelayedExplosionZone(0, 0, 100, 0.5, 50, '💥');
        zone.update(0.6); // Trigger explosion

        expect(damageSystem.dealRawDamage).toHaveBeenCalledWith(
            enemy,
            50,
            enemy.pos
        );
    });

    it('should NOT damage enemies outside blast radius', () => {
        const enemy = { pos: { x: 200, y: 0 } }; // Outside 100 radius
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        const zone = new DelayedExplosionZone(0, 0, 100, 0.5, 50, '💥');
        zone.update(0.6);

        expect(damageSystem.dealRawDamage).not.toHaveBeenCalled();
    });

    it('should die after explosion animation', () => {
        const zone = new DelayedExplosionZone(0, 0, 100, 0.1, 50, '💥');

        // Trigger explosion and wait for animation
        zone.update(0.2); // Explode
        zone.update(0.5); // Animation
        zone.update(0.5); // More animation

        expect(zone.isDead).toBe(true);
    });
});

describe('MindBlastZone', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should progress through stages', () => {
        const zone = new MindBlastZone(0, 0, 100, 50);

        expect(zone.stage).toBe('warning');

        zone.update(0.6); // Past 0.5s, stageTimer = 0.6
        expect(zone.stage).toBe('charge');

        zone.update(0.5); // stageTimer = 1.1 (> 1.0), triggers blast
        expect(zone.stage).toBe('blast');
    });

    it('should damage enemies in blast stage', () => {
        const enemy = { pos: { x: 50, y: 0 } };
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        const zone = new MindBlastZone(0, 0, 100, 50);

        // Progress to blast
        zone.update(0.6); // warning -> charge
        zone.update(0.5); // charge -> blast (stage changes)
        zone.update(0.01); // blast logic runs

        expect(damageSystem.dealRawDamage).toHaveBeenCalledWith(
            enemy,
            50,
            enemy.pos
        );
    });

    it('should apply stun if stunDuration > 0', () => {
        const enemy = { pos: { x: 50, y: 0 }, stunTimer: 0 };
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        const zone = new MindBlastZone(0, 0, 100, 50, undefined, 1.5);

        zone.update(0.6); // warning -> charge (stageTimer = 0.6)
        expect(zone.stage).toBe('charge');

        zone.update(0.5); // stageTimer = 1.1 -> stage becomes 'blast'
        expect(zone.stage).toBe('blast');

        // Blast logic runs on the NEXT update after stage transition
        zone.update(0.01);
        expect((zone as any).blastTriggered).toBe(true);

        expect(enemy.stunTimer).toBe(1.5);
    });

    it('should NOT apply stun if stunDuration is 0', () => {
        const enemy = { pos: { x: 50, y: 0 }, stunTimer: 0 };
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        const zone = new MindBlastZone(0, 0, 100, 50, undefined, 0);

        zone.update(0.6); // warning -> charge
        zone.update(0.5); // charge -> blast
        zone.update(0.01); // blast logic runs

        expect(enemy.stunTimer).toBe(0);
    });

    it('should only damage once (blast not repeated)', () => {
        const enemy = { pos: { x: 50, y: 0 } };
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([enemy]);

        const zone = new MindBlastZone(0, 0, 100, 50);

        zone.update(0.6); // warning -> charge
        zone.update(0.5); // charge -> blast
        zone.update(0.01); // blast logic runs (first damage)
        zone.update(0.5); // Still in blast stage

        expect(damageSystem.dealRawDamage).toHaveBeenCalledTimes(1);
    });

    it('should die after fade stage', () => {
        const zone = new MindBlastZone(0, 0, 100, 50);

        zone.update(0.6);  // charge
        zone.update(0.6);  // blast
        zone.update(0.8);  // towards fade
        zone.update(0.6);  // fade done

        expect(zone.isDead).toBe(true);
    });
});
