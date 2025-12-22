/**
 * ORBITAL STRIKE WEAPON
 * Calls down random explosions.
 * 
 * Evolved: Atomic Bomb - Massive nuclear explosion
 */
import { Weapon } from '../../Weapon';
import { type Vector2 } from '../../core/Utils';
import { DelayedExplosionZone } from '../base';
import { AtomicBombZone } from '../EvolutionTypes';
import { WEAPON_STATS } from '../../data/GameData';

export class OrbitalStrikeWeapon extends Weapon {
    name = "Orbital Strike";
    emoji = "🛰️";
    description = "Calls down random explosions.";
    private stats = WEAPON_STATS['orbital_strike'];
    private activeAtomicBomb: any = null;
    private waitingForExplosion: boolean = false;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const isEvolved = this.evolved;

        if (isEvolved && this.waitingForExplosion) {
            if (this.activeAtomicBomb && this.activeAtomicBomb.isDead) {
                this.waitingForExplosion = false;
                this.activeAtomicBomb = null;
            }
            return;
        }

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            // Calculate damage once with crit
            const atomicResult = (this.owner as any).getDamage(this.damage * 8);
            const normalResult = (this.owner as any).getDamage(this.damage);

            if (isEvolved) {
                const atomicBomb = new AtomicBombZone(
                    this.owner.pos.x + (Math.random() - 0.5) * 300,
                    this.owner.pos.y + (Math.random() - 0.5) * 200,
                    300,
                    atomicResult.damage,
                    (pos, amount) => this.onDamage(pos, amount, atomicResult.isCrit)
                );
                this.activeAtomicBomb = atomicBomb;
                this.waitingForExplosion = true;
                this.onSpawn(atomicBomb);

                this.cooldown = 8.0 * (this.owner as any).stats.cooldown;
            } else {
                const offsetX = (Math.random() - 0.5) * 1000;
                const offsetY = (Math.random() - 0.5) * 800;

                const zone = new DelayedExplosionZone(
                    this.owner.pos.x + offsetX,
                    this.owner.pos.y + offsetY,
                    this.area * (this.owner as any).stats.area * (1 + this.level * 0.1),
                    1.0,
                    normalResult.damage,
                    '💥',
                    (pos, amount) => this.onDamage(pos, amount, normalResult.isCrit)
                );
                this.onSpawn(zone);
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    // Uses base class upgrade()

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}
