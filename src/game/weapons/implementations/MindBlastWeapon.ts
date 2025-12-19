/**
 * MIND BLAST WEAPON
 * Psionic storm at enemy location.
 * 
 * Evolved: Psychic Storm - Cascading stun zone
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { MindBlastZone } from '../base';
import { PsychicStormZone } from '../EvolutionTypes';
import { WEAPON_STATS } from '../../data/GameData';

function getStats(weaponId: string) {
    return WEAPON_STATS[weaponId] || {
        damage: 10, cooldown: 1.0, area: 100, speed: 0, duration: 1.0
    };
}

export class MindBlastWeapon extends Weapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Psionic storm at enemy location.";
    private stats = getStats('mind_blast');

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
            const targets = enemies.filter(e => distance(this.owner.pos, e.pos) < 600);

            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                const isEvolved = this.evolved;
                const result = (this.owner as any).getDamage(this.damage);

                if (isEvolved) {
                    const zone = new PsychicStormZone(
                        target.pos.x,
                        target.pos.y,
                        this.area * (this.owner as any).stats.area,
                        result.damage,
                        2.0,
                        (pos, amount) => this.onDamage(pos, amount, result.isCrit)
                    );
                    this.onSpawn(zone);
                } else {
                    const zone = new MindBlastZone(
                        target.pos.x,
                        target.pos.y,
                        this.area * (this.owner as any).stats.area,
                        result.damage,
                        (pos, amount) => this.onDamage(pos, amount, result.isCrit),
                        0
                    );
                    this.onSpawn(zone);
                }

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    // Uses base class upgrade()

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}
