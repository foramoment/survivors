/**
 * VOID RAY WEAPON
 * Fires a powerful charging beam at enemies.
 * 
 * Evolved: Void Cannon - Double damage, wider beam
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { VoidRayBeam } from '../base';
import { WEAPON_STATS } from '../../data/GameData';

function getStats(weaponId: string) {
    return WEAPON_STATS[weaponId] || {
        damage: 10, cooldown: 1.0, area: 100, speed: 300, duration: 1.0
    };
}

export class VoidRayWeapon extends Weapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Fires a powerful charging beam.";
    private stats = getStats('void_ray');

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
            let target: Entity | null = null;
            let minDst = Infinity;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < 600 && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                const isEvolved = this.evolved;
                const result = (this.owner as any).getDamage(this.damage);
                const damage = result.damage * (isEvolved ? 2 : 1);
                const isCrit = result.isCrit;

                const beam = new VoidRayBeam(
                    this.owner,
                    target,
                    damage,
                    isEvolved,
                    (pos, amount) => this.onDamage(pos, amount, isCrit)
                );
                this.onSpawn(beam);

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    // Uses base class upgrade() with damageScaling and areaScaling

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}
