/**
 * STATUS EFFECT TESTS
 * 
 * Tests for StatusEffect base class and implementations:
 * - Burn (DoT)
 * - Slow
 * - Stun
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Burn } from '../status/Burn';
import { Slow } from '../status/Slow';
import { Stun } from '../status/Stun';

// Mock damageSystem
vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealDamage: vi.fn()
    }
}));

// Mock particles
vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitHit: vi.fn(),
        emitFire: vi.fn(),
        emitFrost: vi.fn()
    }
}));

import { damageSystem } from '../core/DamageSystem';
import { particles } from '../core/ParticleSystem';

// Mock enemy
const createMockEnemy = () => ({
    pos: { x: 100, y: 100 },
    speedMultiplier: 1,
    hp: 100,
    isDead: false,
    takeDamage: vi.fn()
});

describe('StatusEffect System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Burn', () => {
        it('should decrease duration over time', () => {
            const burn = new Burn(3.0, 10);
            const enemy = createMockEnemy();

            burn.update(1.0, enemy as any);

            expect(burn.duration).toBe(2.0);
        });

        it('should deal damage on tick', () => {
            const burn = new Burn(3.0, 10);
            burn.tickInterval = 0.5;
            const enemy = createMockEnemy();

            // Simulate 0.5s to trigger first tick
            burn.update(0.5, enemy as any);

            expect(damageSystem.dealDamage).toHaveBeenCalledWith({
                baseDamage: 10,
                source: null,
                target: enemy,
                position: enemy.pos
            });
        });

        it('should emit particles on tick', () => {
            const burn = new Burn(3.0, 10);
            burn.tickInterval = 0.5;
            const enemy = createMockEnemy();

            burn.update(0.5, enemy as any);

            expect(particles.emitHit).toHaveBeenCalledWith(100, 100, '#ff6600');
        });

        it('should preserve tick timer overflow', () => {
            const burn = new Burn(3.0, 10);
            burn.tickInterval = 0.5;
            const enemy = createMockEnemy();

            // 0.6s update - should tick once by 0.5s, leave 0.1s
            burn.update(0.6, enemy as any);

            // tickTimer should be 0.1 (0.6 - 0.5)
            expect(damageSystem.dealDamage).toHaveBeenCalledTimes(1);

            // Another 0.4s should trigger second tick
            burn.update(0.4, enemy as any);
            expect(damageSystem.dealDamage).toHaveBeenCalledTimes(2);
        });

        it('should store source weapon for crit calculation', () => {
            const mockWeapon = { damage: 10, name: 'TestWeapon' };
            const burn = new Burn(3.0, 10, mockWeapon as any);

            expect(burn.source).toBe(mockWeapon);
        });
    });

    describe('Slow', () => {
        it('should reduce speedMultiplier', () => {
            const slow = new Slow(2.0, 0.5); // 50% slow
            const enemy = createMockEnemy();

            slow.update(0.1, enemy as any);

            expect(enemy.speedMultiplier).toBe(0.5);
        });

        it('should take minimum speedMultiplier when multiple slows', () => {
            const enemy = createMockEnemy();
            enemy.speedMultiplier = 0.7; // Already slowed 30%

            const slow = new Slow(2.0, 0.5); // 50% slow
            slow.update(0.1, enemy as any);

            expect(enemy.speedMultiplier).toBe(0.5); // Takes the stronger slow
        });

        it('should decrease duration', () => {
            const slow = new Slow(2.0, 0.5);
            const enemy = createMockEnemy();

            slow.update(0.5, enemy as any);

            expect(slow.duration).toBe(1.5);
        });
    });

    describe('Stun', () => {
        it('should set speedMultiplier to 0', () => {
            const stun = new Stun(1.0);
            const enemy = createMockEnemy();

            stun.update(0.1, enemy as any);

            expect(enemy.speedMultiplier).toBe(0);
        });

        it('should decrease duration', () => {
            const stun = new Stun(1.5);
            const enemy = createMockEnemy();

            stun.update(0.5, enemy as any);

            expect(stun.duration).toBe(1.0);
        });
    });

    describe('Enemy Integration', () => {
        it('should allow effects to stack', () => {
            const mockEnemy = {
                ...createMockEnemy(),
                effects: [] as any[],
                applyEffect(effect: any) {
                    this.effects.push(effect);
                    effect.onApply?.(this);
                },
                updateEffects(dt: number) {
                    for (let i = this.effects.length - 1; i >= 0; i--) {
                        const effect = this.effects[i];
                        effect.update(dt, this);
                        if (effect.duration <= 0) {
                            effect.onRemove?.(this);
                            this.effects.splice(i, 1);
                        }
                    }
                }
            };

            // Apply two burns
            mockEnemy.applyEffect(new Burn(3.0, 5));
            mockEnemy.applyEffect(new Burn(2.0, 10));

            expect(mockEnemy.effects.length).toBe(2);
        });

        it('should remove expired effects', () => {
            const mockEnemy = {
                ...createMockEnemy(),
                effects: [] as any[],
                applyEffect(effect: any) {
                    this.effects.push(effect);
                },
                updateEffects(dt: number) {
                    for (let i = this.effects.length - 1; i >= 0; i--) {
                        const effect = this.effects[i];
                        effect.update(dt, this);
                        if (effect.duration <= 0) {
                            effect.onRemove?.(this);
                            this.effects.splice(i, 1);
                        }
                    }
                }
            };

            mockEnemy.applyEffect(new Stun(0.5));
            expect(mockEnemy.effects.length).toBe(1);

            // Simulate 1 second - effect should expire
            mockEnemy.updateEffects(1.0);
            expect(mockEnemy.effects.length).toBe(0);
        });
    });
});
