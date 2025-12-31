import { describe, it, expect, vi, beforeEach } from 'vitest';
import { damageSystem } from '../core/DamageSystem';
import { Weapon } from '../Weapon';
import { Zone } from '../weapons/base/Zone';
import { Projectile } from '../weapons/base/Projectile';

// Mock dependencies causing side effects
vi.mock('../entities/Player', () => ({
    Player: class {
        pos = { x: 0, y: 0 };
        stats = { might: 1, critChance: 0, critDamage: 2, area: 1, duration: 1, cooldown: 1, speed: 1 };
        constructor() { }
    }
}));

vi.mock('../core/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 }
    }
}));

vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        remove: vi.fn(),
        update: vi.fn()
    }
}));

vi.mock('../core/ParticleSystem', () => ({
    particles: {
        emitHit: vi.fn(),
        emitText: vi.fn()
    }
}));

class TestWeapon extends Weapon {
    name = "Test Weapon";
    description = "Test";
    emoji = "T";
    stats = { damage: 10, cooldown: 1, area: 1, speed: 1, duration: 1 };

    constructor(owner: any) {
        super(owner);
        this.damage = this.stats.damage;
    }

    update(_dt: number) { }
}

describe('Damage Refactor Verification', () => {
    let player: any;
    let weapon: TestWeapon;
    let enemy: any;

    beforeEach(() => {
        // Setup player with specific stats
        player = {
            pos: { x: 0, y: 0 },
            stats: {
                might: 1.0,
                critChance: 0.0, // 0% by default for deterministic tests
                critDamage: 2.0,
                area: 1.0,
                duration: 1.0,
                cooldown: 1.0,
                speed: 1.0
            }
        } as any;

        // Setup weapon linked to player
        weapon = new TestWeapon(player);

        // Setup enemy
        enemy = {
            pos: { x: 100, y: 100 },
            takeDamage: vi.fn(),
            isDead: false,
            radius: 10
        };

        // Mock applyDamage internal? No, damageSystem is real singleton
        // We can spy on enemy.takeDamage which is called by damageSystem.applyDamage
    });

    it('should calculate damage dynamically based on player might', () => {
        const zone = new Zone(0, 0, 10, 1, 10, 1, '');
        zone.source = weapon; // Link to weapon -> player

        // 1. Base damage check
        damageSystem.dealDamage({
            baseDamage: 10,
            source: zone,
            target: enemy,
            position: { x: 0, y: 0 }
        });
        expect(enemy.takeDamage).toHaveBeenLastCalledWith(20); // might 1.0 * critDamage 2.0 = 20

        // 2. Increase player might
        player.stats.might = 2.0;

        // Deal damage again with SAME projectile/zone
        damageSystem.dealDamage({
            baseDamage: 10,
            source: zone,
            target: enemy,
            position: { x: 0, y: 0 }
        });

        // Should be 40 now (10 * 2.0 might * 2.0 critDamage)
        expect(enemy.takeDamage).toHaveBeenLastCalledWith(40);
    });

    it('should apply critical hits based on player crit chance', () => {
        const zone = new Zone(0, 0, 10, 1, 10, 1, '');
        zone.source = weapon;

        // 1. 100% crit chance
        player.stats.critChance = 1.0;
        player.stats.critDamage = 2.0;
        player.stats.might = 1.0;

        const result = damageSystem.dealDamage({
            baseDamage: 10,
            source: zone,
            target: enemy,
            position: { x: 0, y: 0 }
        });

        // result.finalDamage should be 20
        expect(result.finalDamage).toBe(20);
        expect(result.isCrit).toBe(true);
        expect(enemy.takeDamage).toHaveBeenLastCalledWith(20);
    });

    it('should properly track source chain Zone -> Weapon -> Player', () => {
        const zone = new Zone(0, 0, 10, 1, 10, 1, '');
        zone.source = weapon;

        player.stats.might = 5.0;

        const result = damageSystem.dealDamage({
            baseDamage: 10,
            source: zone,
            target: enemy,
            position: { x: 0, y: 0 }
        });

        expect(result.finalDamage).toBe(100); // 10 * 5.0 might * 2.0 critDamage
    });

    it('should properly track source chain Projectile -> Weapon -> Player', () => {
        const proj = new Projectile(0, 0, { x: 0, y: 0 }, 1, 10, 1, '');
        proj.source = weapon;

        player.stats.might = 3.0;

        const result = damageSystem.dealDamage({
            baseDamage: 10,
            source: proj,
            target: enemy,
            position: { x: 0, y: 0 }
        });

        expect(result.finalDamage).toBe(60); // 10 * 3.0 might * 2.0 critDamage
    });

    it('should fallback to raw damage if source is missing', () => {
        const zone = new Zone(0, 0, 10, 1, 10, 1, '');
        // zone.source is undefined

        player.stats.might = 100.0; // Should be ignored

        const result = damageSystem.dealDamage({
            baseDamage: 10,
            source: zone,
            target: enemy,
            position: { x: 0, y: 0 }
        });

        expect(result.finalDamage).toBe(10);
    });
});
