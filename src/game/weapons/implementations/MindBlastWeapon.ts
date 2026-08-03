/**
 * MIND BLAST WEAPON
 *
 * A psionic detonation on top of an enemy: concentric shockrings snap outward
 * from the impact, everything caught takes damage and is briefly stunned
 * (core/StatusEffects — the old code set an `enemy.stunDuration` field that
 * nothing ever read, so the stun did nothing at all).
 *
 * The blast starts small and the mind widens with every level (see
 * blastRadius) — the one axis where growth is legible on a weapon whose whole
 * body is a circle.
 *
 * Evolved — Psychic Cascade: the first blast jumps to further targets, one
 * every 0.18s, each a little weaker, on a longer cooldown. It reads as a
 * thought tearing through the crowd instead of one static pink circle.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { type Vector2, distance } from '../../core/Utils';
import { Zone } from '../base';
import { levelSpatialHash } from '../../core/SpatialHash';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { status } from '../../core/StatusEffects';
import { juice } from '../../core/JuiceSystem';

// ============================================
// PSI BLAST - shockrings + stun, one detonation
// ============================================
export class PsiBlastZone extends Zone {
    private age: number = 0;
    private detonated: boolean = false;
    private stunDuration: number;
    /** Baked spike angles so the star doesn't shimmer frame to frame */
    private spikes: number[] = [];
    /** Called once with the enemies this blast caught (evolved cascade) */
    onCaught?: (hits: any[]) => void;

    constructor(x: number, y: number, radius: number, damage: number, stunDuration: number) {
        super(x, y, radius, 0.5, damage, Number.MAX_VALUE, '');
        this.stunDuration = stunDuration;
        const count = 6;
        for (let i = 0; i < count; i++) {
            this.spikes.push((i / count) * Math.PI * 2 + Math.random() * 0.3);
        }
    }

    update(dt: number) {
        super.update(dt);
        this.age += dt;

        if (this.detonated) return;
        this.detonated = true;

        const caught: any[] = [];
        for (const enemy of levelSpatialHash.getNearby(this.pos, this.radius)) {
            if (enemy.isDead) continue;
            if (distance(this.pos, enemy.pos) > this.radius + enemy.radius) continue;

            damageSystem.dealDamage({
                baseDamage: this.damage,
                source: this.source,
                target: enemy,
                position: enemy.pos,
            });
            // Bosses shrug most of it off — a permanently stunned boss is no boss
            status.stun(enemy, enemy.isBoss ? this.stunDuration * 0.25 : this.stunDuration);
            caught.push(enemy);
        }

        particles.emitPsiWave(this.pos.x, this.pos.y, this.radius);
        this.onCaught?.(caught);
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const t = Math.min(1, this.age / 0.5);
        const alpha = 1 - t;
        if (alpha <= 0) return;

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Three rings chasing each other outward
        for (let i = 0; i < 3; i++) {
            const phase = Math.max(0, t - i * 0.12) / (1 - i * 0.12);
            if (phase <= 0) continue;
            const r = this.radius * phase;
            ctx.strokeStyle = `rgba(255, 140, 240, ${alpha * (0.9 - i * 0.25)})`;
            ctx.lineWidth = 5 - i * 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Psi star: hard spikes shooting out of the impact point
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const angle of this.spikes) {
            const inner = this.radius * 0.12;
            const outer = this.radius * (0.35 + t * 0.75);
            ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        }
        ctx.stroke();

        // Collapsing core
        ctx.fillStyle = `rgba(196, 107, 255, ${alpha * 0.85})`;
        const core = this.radius * 0.22 * (1 - t);
        ctx.fillRect(-core, -core, core * 2, core * 2);

        ctx.restore();
    }
}

/**
 * How far the blast may reach for a target.
 *
 * Deliberately shorter than the screen. A weapon that fires off-screen is not
 * "long range", it is a weapon you never see work — and the player is looking
 * at the pack around them, not at the far corner of the arena. 330px keeps
 * every detonation inside the part of the screen you are actually watching,
 * even in a small window.
 */
const MIND_BLAST_RANGE = 330;

export class MindBlastWeapon extends Weapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Psionic detonation that stuns everything it catches.";

    readonly stats = {
        damage: 20,
        cooldown: 3,
        // Halved from 120. A level-1 blast used to open at the size the weapon
        // was meant to reach at level 5, so the only thing levelling changed
        // was the damage number and the psi-star had nowhere to grow.
        area: 60,
        speed: 0,
        duration: 0.5,
    };
    /** Blast radius gained per weapon level, as a share of the base */
    private static readonly RADIUS_PER_LEVEL = 0.2;

    /** Pending cascade jumps: {x, y, damage, delay} */
    private cascade: { x: number, y: number, damage: number, delay: number, hops: number }[] = [];

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;

        // Cascade hops resolve on their own timers so a chain never lands in
        // a single frame
        for (let i = this.cascade.length - 1; i >= 0; i--) {
            const hop = this.cascade[i];
            hop.delay -= dt;
            if (hop.delay > 0) continue;
            this.cascade.splice(i, 1);
            this.detonate(hop.x, hop.y, hop.damage, hop.hops);
        }

        if (this.cooldown <= 0) {
            // Where the pack is, inside arm's reach — not a random body half a
            // screen away.
            //
            // This used to be `findRandomEnemies(1, 600)`, and both halves were
            // wrong. 600px is most of a windowed screen, so the blast regularly
            // went off at the far edge; and *random* meant it actively ignored
            // the crowd standing on the player to pick a lone straggler. The
            // weapon looked broken because it was firing somewhere you were not
            // looking, at nothing in particular.
            const spot = this.findDensestSpot(MIND_BLAST_RANGE, this.blastRadius());
            if (spot) {
                this.detonate(spot.x, spot.y, this.damage, this.evolved ? 3 : 0);
                juice.addTrauma(0.08);
                // A cascade is four stunning blasts walking through the pack —
                // at the base cooldown it kept the whole crowd frozen
                const cdMultiplier = this.evolved ? 1.6 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }

    /** The mind grows: +20% of the base radius per weapon level */
    private blastRadius(): number {
        const growth = 1 + (this.level - 1) * MindBlastWeapon.RADIUS_PER_LEVEL;
        return this.area * this.owner.stats.area * growth;
    }

    private detonate(x: number, y: number, damage: number, hopsLeft: number) {
        const radius = this.blastRadius();
        const zone = new PsiBlastZone(x, y, radius, damage, this.evolved ? 1.4 : 0.7);
        zone.source = this;

        if (hopsLeft > 0) {
            zone.onCaught = (hits: any[]) => {
                // Jump to the nearest enemy that this blast did NOT already hit
                const next = this.findJumpTarget({ x, y }, radius, hits);
                if (!next) return;
                this.cascade.push({
                    x: next.pos.x,
                    y: next.pos.y,
                    damage: damage * 0.8,
                    delay: 0.18,
                    hops: hopsLeft - 1,
                });
            };
        }

        this.onSpawn(zone);
    }

    private findJumpTarget(from: Vector2, radius: number, exclude: any[]): any | null {
        let best: any = null;
        let bestDist = radius * 3;
        for (const enemy of levelSpatialHash.getNearby(from, radius * 3)) {
            if (enemy.isDead || exclude.includes(enemy)) continue;
            const dist = distance(from, enemy.pos);
            if (dist > radius * 0.8 && dist < bestDist) {
                bestDist = dist;
                best = enemy;
            }
        }
        return best;
    }
}
