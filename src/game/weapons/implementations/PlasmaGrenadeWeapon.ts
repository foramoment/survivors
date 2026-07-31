/**
 * PLASMA GRENADE WEAPON
 *
 * Lobs canisters that detonate where they land. The grenade is drawn as a
 * spinning canister with a ground shadow and a closing marker ring, so you can
 * see it coming and read the blast before it happens.
 *
 * Evolved — Cluster Bomb: three canisters per throw, fanned around the target
 * and staggered by a few frames, each with a smaller blast. Chain detonations
 * are capped and delayed rather than fired all at once: a full-screen volley
 * used to spawn dozens of `emitExplosion` bursts in a single frame, which is
 * what made the game hitch.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { LobbedProjectile, PlasmaExplosionZone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { juice } from '../../core/JuiceSystem';

/** Chain explosions allowed per detonation (evolved only) */
const MAX_CHAINS = 3;

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
        if (this.cooldown > 0) return;

        const target = this.findClosestEnemy(500);
        if (!target) return;

        const flight = this.duration * this.owner.stats.duration;

        if (this.evolved) {
            // Cluster: one on target, two fanned out around it
            const spread = this.area * this.owner.stats.area * 1.1;
            const base = Math.random() * Math.PI * 2;
            for (let i = 0; i < 3; i++) {
                const angle = base + (i / 3) * Math.PI * 2;
                const offset = i === 0
                    ? { x: 0, y: 0 }
                    : { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread };
                this.throwGrenade(
                    { x: target.pos.x + offset.x, y: target.pos.y + offset.y },
                    flight + i * 0.06,
                    i * 0.08,
                    0.6
                );
            }
        } else {
            this.throwGrenade({ x: target.pos.x, y: target.pos.y }, flight, 0, 1);
        }

        this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
    }

    private throwGrenade(target: { x: number, y: number }, flight: number, delay: number, power: number) {
        const lob = new LobbedProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            target,
            flight,
            ''
        );
        lob.height = 80;
        lob.delay = delay;
        lob.color = this.evolved ? '#ffb03c' : '#3ddc6e';
        lob.onLand = (x, y) => this.createExplosion(x, y, power);
        this.onSpawn(lob);
    }

    private createExplosion(x: number, y: number, power: number, allowChains: boolean = true) {
        const explosionRadius = this.area * this.owner.stats.area * power;

        const zone = new PlasmaExplosionZone(
            x,
            y,
            explosionRadius,
            this.damage * power,
            this.evolved
        );
        zone.source = this;

        particles.emitPlasmaBurst(x, y, explosionRadius, this.evolved);
        juice.addTrauma(0.1 * power);
        juice.shockwave(x, y, explosionRadius * 1.5, this.evolved ? '#ffb03c' : '#66ff88', 0.3, 4);

        // Evolved: a few secondary blasts, spread over the next third of a
        // second so the damage numbers and particles don't land in one frame
        if (this.evolved && allowChains) {
            let chains = 0;
            zone.onChainExplosion = (targetX: number, targetY: number) => {
                if (chains >= MAX_CHAINS) return;
                const delay = 0.08 + chains * 0.09;
                chains++;
                const chainZone = new PlasmaExplosionZone(
                    targetX,
                    targetY,
                    explosionRadius * 0.55,
                    this.damage * power * 0.5,
                    false
                );
                chainZone.source = this;
                chainZone.detonationDelay = delay;
                chainZone.onDetonate = (cx, cy, r) => {
                    particles.emitPlasmaBurst(cx, cy, r, true);
                };
                this.onSpawn(chainZone);
            };
        }

        this.onSpawn(zone);
    }
}
