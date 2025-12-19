/**
 * PHANTOM SLASH WEAPON
 * Instantly cuts random enemies in range.
 * 
 * Evolved: Dimensional Blade - Creates rift zones that slow enemies
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { Zone } from '../base';
import { DimensionalRiftZone } from '../EvolutionTypes';
import { WEAPON_STATS } from '../../data/GameData';
import { damageSystem } from '../../core/DamageSystem';

function getStats(weaponId: string) {
    return WEAPON_STATS[weaponId] || {
        damage: 10, cooldown: 1.0, area: 100, count: 3, countScaling: 1
    };
}

export class PhantomSlashWeapon extends Weapon {
    name = "Phantom Slash";
    emoji = "⚔️";
    description = "Instantly cuts random enemies.";
    private stats = getStats('phantom_slash');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const targets = enemies.filter(e => distance(this.owner.pos, e.pos) < this.area * (this.owner as any).stats.area);

            if (targets.length > 0) {
                const isEvolved = this.evolved;
                const baseCount = (this.stats.count || 3) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
                const count = isEvolved ? baseCount * 2 : baseCount;

                for (let i = 0; i < count; i++) {
                    if (targets.length === 0) break;
                    const idx = Math.floor(Math.random() * targets.length);
                    const target = targets[idx];

                    if (!isEvolved) {
                        targets.splice(idx, 1);
                    }

                    // Use DamageSystem - handles crit, damage, and damage numbers automatically
                    const result = damageSystem.dealDamage({
                        baseDamage: this.damage,
                        source: this,
                        target: target,
                        position: target.pos
                    });

                    if (isEvolved) {
                        const rift = new DimensionalRiftZone(target.pos.x, target.pos.y, result.finalDamage * 0.2);
                        this.onSpawn(rift);
                    } else {
                        const slash = new Zone(target.pos.x, target.pos.y, 40, 0.2, 0, 1, '⚔️');
                        this.onSpawn(slash);
                    }
                }
                const cdMultiplier = isEvolved ? 1.3 : 1.0;
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown * cdMultiplier;
            }
        }
    }

    // Uses base class upgrade() with damageScaling and areaScaling

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

