/**
 * FROST NOVA WEAPON
 * Throws freezing grenades that create slowing zones.
 * 
 * Evolved: Absolute Zero - Complete freeze effect
 */
import { Weapon } from '../../Weapon';
import { type Vector2 } from '../../core/Utils';
import { LobbedProjectile, FrostZone } from '../base';
import { AbsoluteZeroZone } from '../EvolutionTypes';
import { particles } from '../../core/ParticleSystem';
import { WEAPON_STATS } from '../../data/GameData';

export class FrostNovaWeapon extends Weapon {
    name = "Frost Nova";
    emoji = "❄️";
    description = "Throws freezing grenades.";
    private stats = WEAPON_STATS['frost_nova'];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const range = 400;
            const offsetX = (Math.random() - 0.5) * 2 * range;
            const offsetY = (Math.random() - 0.5) * 2 * range;
            const target = { x: this.owner.pos.x + offsetX, y: this.owner.pos.y + offsetY };

            const lob = new LobbedProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                target,
                0.6,
                '❄️'
            );

            lob.onLand = (x, y) => {
                const isEvolved = this.evolved;
                particles.emitFrost(x, y);

                if (isEvolved) {
                    const zone = new AbsoluteZeroZone(
                        x, y,
                        this.area * (this.owner as any).stats.area,
                        (this.owner as any).getDamage(this.damage).damage,
                        this.stats.duration * (this.owner as any).stats.duration
                    );
                    this.onSpawn(zone);
                } else {
                    const zone = new FrostZone(
                        x, y,
                        this.area * (this.owner as any).stats.area,
                        this.stats.duration * (this.owner as any).stats.duration,
                        (this.owner as any).getDamage(this.damage).damage,
                        0.5,
                        0.5
                    );
                    this.onSpawn(zone);
                }
            };

            this.onSpawn(lob);
            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    // Uses base class upgrade()

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}
