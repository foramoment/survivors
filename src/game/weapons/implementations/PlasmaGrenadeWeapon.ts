/**
 * PLASMA GRENADE WEAPON
 *
 * Lobs canisters that detonate where they land. The grenade is drawn as a
 * spinning canister with a ground shadow and a closing marker ring, so you can
 * see it coming and read the blast before it happens.
 *
 * Every blast also *concusses*: anything caught is stunned briefly. The grenade
 * used to be pure damage in a genre where damage is cheap, and it read as the
 * weakest thing in the pool; a short stun makes it the button you press to stop
 * a charge, the way Mind Blast does but on a much shorter cooldown.
 *
 * The throw grows with the weapon: one more canister every second level (see
 * canisterCount), so levelling changes where you can cover rather than only how
 * hard one crater hits.
 *
 * Evolved — Cluster Bomb: five canisters per throw on a longer cooldown, each
 * with a smaller blast, a longer stun, and a patch of burning ground left in
 * the crater. Chain detonations are capped and delayed rather than fired all at
 * once: a full-screen volley used to spawn dozens of `emitExplosion` bursts in
 * a single frame, which is what made the game hitch.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { LobbedProjectile, PlasmaExplosionZone, BurningTrailZone } from '../base';
import { particles } from '../../../engine/ParticleSystem';
import { juice } from '../../../engine/JuiceSystem';
import { status } from '../../core/StatusEffects';
import { levelSpatialHash } from '../../../engine/SpatialHash';
import { distance } from '../../../engine/Utils';

/** Chain explosions allowed per detonation (evolved only) */
const MAX_CHAINS = 3;

/**
 * Seconds of stun on a direct blast. Bosses get a quarter of it.
 *
 * Deliberately NOT divided by the canister count. It used to be scaled by the
 * same `power` share as the damage, which meant the evolution — advertised as a
 * *longer* concussion — actually stunned for less than the base weapon: 0.9
 * nominal times a 0.447 share is 0.40s, against 0.55s from a single canister.
 * The concussion is a property of being caught in a blast, not a pool split
 * between canisters, and `StatusEffects.stun` already caps how much of the time
 * any enemy can be frozen, so nothing here can turn into a lockdown.
 */
const STUN_BASE = 0.7;
const STUN_EVOLVED = 1.3;

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

    /**
     * Canisters per throw: one more every second level, plus two on evolving.
     * L1 1, L3 2, L5 3, evolved 5.
     *
     * Levelling this weapon used to do nothing but +20% damage, which for a
     * thrown area weapon is the least interesting axis there is — you already
     * had one crater, it just got hotter. A second canister changes where you
     * can throw.
     */
    private canisterCount(): number {
        const base = 1 + Math.floor((this.level - 1) / 2);
        return this.evolved ? base + 2 : base;
    }

    /**
     * Damage share of a single canister, `1/sqrt(count)`.
     *
     * A cluster must not be a straight multiplication of the single throw, or
     * every extra canister is a free damage upgrade on top of the coverage.
     * The square root means total output grows as sqrt(count) — 1 → 1.41 → 1.73
     * → 2.24 — so more canisters is mostly more *reach*.
     */
    private canisterPower(count: number): number {
        return 1 / Math.sqrt(count);
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        const target = this.findClosestEnemy(500);
        if (!target) return;

        const flight = this.duration * this.owner.stats.duration;
        const count = this.canisterCount();
        const power = this.canisterPower(count);

        if (count === 1) {
            this.throwGrenade({ x: target.pos.x, y: target.pos.y }, flight, 0, power);
        } else {
            // One on the target, the rest fanned around it and staggered by a
            // few frames so the blasts roll instead of landing in one frame
            const spread = this.area * this.owner.stats.area * 1.1;
            const base = Math.random() * Math.PI * 2;
            for (let i = 0; i < count; i++) {
                const angle = base + (i / count) * Math.PI * 2;
                const offset = i === 0
                    ? { x: 0, y: 0 }
                    : { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread };
                this.throwGrenade(
                    { x: target.pos.x + offset.x, y: target.pos.y + offset.y },
                    flight + i * 0.06,
                    i * 0.08,
                    power,
                );
            }
        }

        // Five canisters and a field of burning ground is worth waiting for
        const cdMultiplier = this.evolved ? 1.5 : 1.0;
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
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
        lob.kind = 'grenade';
        // Violet plasma canister; the evolved cluster runs hot orange
        lob.color = this.evolved ? '#ffb03c' : '#b06cff';
        lob.onLand = (x, y) => this.createExplosion(x, y, power);
        this.onSpawn(lob);
    }

    /**
     * A blast has two rings, and they are different sizes on purpose.
     *
     * The **concussion** reaches much further than the damage: what a grenade
     * is for is stopping a charge, and a stun that only catches what was
     * standing on the fuse does not do that. The **damage and the burn** stay
     * in the tight ring where the canister actually went off, so the weapon
     * does not quietly become an area nuke on the back of its own crowd
     * control.
     */
    private static readonly STUN_RADIUS_SCALE = 1.9;

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
        // Splinters flying out of the casing. They do nothing — they are there
        // because a blast that only expands a circle does not read as a blast.
        particles.emitShrapnel(x, y, explosionRadius,
            this.evolved ? ['#ffd24d', '#ff9a2a', '#fff0c0'] : ['#e2b8ff', '#c98cff', '#ffffff']);
        juice.addTrauma(0.1 * power);
        // Violet plasma, matching the canister that was thrown; the evolved
        // cluster burns orange
        juice.shockwave(x, y, explosionRadius * 1.5, this.evolved ? '#ffb03c' : '#c98cff', 0.3, 4);

        // Concussion — full length per blast (see STUN_BASE), over a ring
        // almost twice the size of the damage
        const stunRadius = explosionRadius * PlasmaGrenadeWeapon.STUN_RADIUS_SCALE;
        const stun = (this.evolved ? STUN_EVOLVED : STUN_BASE) * this.owner.stats.duration;
        for (const enemy of levelSpatialHash.getWithinRadius({ x, y }, stunRadius)) {
            const d = distance({ x, y }, enemy.pos);
            if (d > stunRadius) continue;
            // A boss that can be perma-stunned by a 2.5s cooldown is not a boss
            status.stun(enemy, enemy.isBoss ? stun * 0.25 : stun);
            // Only what was close to the canister catches fire
            if (d <= explosionRadius) {
                status.infect(enemy, {
                    dps: this.damage * power * 0.12,
                    duration: 2,
                    source: this,
                    kind: 'burn',
                });
            }
        }

        // Evolved: every crater keeps burning. Five small fires laid across the
        // pack is what makes the Cluster Bomb area denial rather than five
        // copies of the same explosion.
        if (this.evolved) {
            const fire = new BurningTrailZone(
                x, y,
                explosionRadius * 0.7,
                2.2 * this.owner.stats.duration,
                this.damage * power * 0.12,
            );
            fire.burnDps = this.damage * power * 0.3;
            fire.source = this;
            this.onSpawn(fire);
        }

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
