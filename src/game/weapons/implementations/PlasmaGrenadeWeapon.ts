/**
 * PLASMA GRENADE WEAPON
 * Throws plasma grenades that explode on impact.
 * Uses LobbedProjectile for arc trajectory.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { LobbedProjectile, PlasmaExplosionZone } from '../base';
import { particles } from '../../core/ParticleSystem';

export class PlasmaGrenadeWeapon extends Weapon {
    name = "Plasma Grenade";
    emoji = "💣";
    description = "Throws plasma grenades that explode on impact.";

    readonly stats = {
        damage: 25,
        cooldown: 2.5,
        area: 70,        // explosion radius
        speed: 0,
        duration: 0.8,   // lob flight time
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy(500);

            if (target) {
                const lob = new LobbedProjectile(
                    this.owner.pos.x,
                    this.owner.pos.y,
                    target.pos,
                    this.duration * this.owner.stats.duration,
                    '💣'
                );

                // Increase arc height for cooler visuals
                lob.height = 80;

                lob.onLand = (x, y) => {
                    this.createExplosion(x, y);
                };

                this.onSpawn(lob);
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }

    private createExplosion(x: number, y: number) {
        const explosionRadius = this.area * this.owner.stats.area;

        // Create plasma explosion zone
        const zone = new PlasmaExplosionZone(
            x,
            y,
            explosionRadius,
            this.damage,
            this.evolved
        );
        zone.source = this;

        // Emit explosion particles
        particles.emitExplosion(x, y, explosionRadius);

        this.onSpawn(zone);

        // Evolved: chain explosions on nearby enemies
        if (this.evolved) {
            zone.onChainExplosion = (targetX: number, targetY: number) => {
                particles.emitExplosion(targetX, targetY, explosionRadius * 0.5);
                const chainZone = new PlasmaExplosionZone(
                    targetX,
                    targetY,
                    explosionRadius * 0.5,
                    this.damage * 0.5,
                    false  // no further chains
                );
                chainZone.source = this;
                this.onSpawn(chainZone);
            };
        }
    }
}
