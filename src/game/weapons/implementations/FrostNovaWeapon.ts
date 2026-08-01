/**
 * FROST NOVA WEAPON
 *
 * Lobs a freezing charge into the thickest part of the crowd and leaves a field
 * that slows everything standing in it. Slow is the point: it buys distance,
 * which is the resource contact damage now takes away.
 *
 * The old version threw at a random spot within 400px of the player, so most
 * casts landed on empty floor. It now aims with `findDensestSpot`.
 *
 * Evolved — Absolute Zero: the field freezes solid. Frozen enemies are stunned
 * rather than merely slowed, and a shatter burst goes off when the field ends.
 * (The old Absolute Zero wrote `slowMultiplier` / `slowDuration` onto enemies —
 * fields nothing on Enemy has ever read — so the "complete freeze" did nothing
 * at all. Freezing now goes through core/StatusEffects, same as any other stun.)
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { type Vector2, distance } from '../../core/Utils';
import { LobbedProjectile, FrostZone, Zone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { status } from '../../core/StatusEffects';
import { juice } from '../../core/JuiceSystem';

/** How far the weapon looks for a crowd to freeze */
const SEARCH_RANGE = 460;

// ============================================
// ABSOLUTE ZERO - freezes solid, then shatters
// ============================================
export class AbsoluteZeroZone extends Zone {
    /** Seconds of stun refreshed on anything inside */
    freezeDuration: number = 0.6;
    /** Damage of the burst when the field collapses */
    shatterDamage: number = 0;

    private crystalAngle: number = 0;
    private readonly maxDuration: number;
    private frozen: Set<any> = new Set();
    private shattered: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number, duration: number) {
        super(x, y, radius, duration, damage, 0.5, '');
        this.maxDuration = duration;
    }

    update(dt: number) {
        super.update(dt);
        this.crystalAngle += dt;

        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, this.radius)) {
            if (distance(this.pos, enemy.pos) > this.radius) continue;
            status.stun(enemy, this.freezeDuration);
            if (!this.frozen.has(enemy)) {
                this.frozen.add(enemy);
                particles.emitFrost(enemy.pos.x, enemy.pos.y);
            }
        }

        // The field collapsing IS the payoff — everything still inside takes a
        // shatter hit, so holding a pack in the ice is worth more than the tick
        if (this.duration <= 0 && !this.shattered) {
            this.shattered = true;
            this.shatter();
        }
    }

    private shatter() {
        if (this.shatterDamage <= 0) return;

        particles.emitFrost(this.pos.x, this.pos.y);
        juice.shockwave(this.pos.x, this.pos.y, this.radius * 1.7, '#bfe9ff', 0.4, 5);
        juice.addTrauma(0.2);

        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, this.radius)) {
            if (distance(this.pos, enemy.pos) > this.radius) continue;
            damageSystem.dealDamage({
                baseDamage: this.shatterDamage,
                source: this.source,
                target: enemy,
                position: enemy.pos,
            });
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.max(0, Math.min(1, this.duration / Math.min(1, this.maxDuration)));

        // Ice floor
        const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        floor.addColorStop(0, `rgba(200, 240, 255, ${0.45 * fade})`);
        floor.addColorStop(0.5, `rgba(100, 200, 255, ${0.28 * fade})`);
        floor.addColorStop(1, 'rgba(50, 150, 255, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = floor;
        ctx.fill();

        // Shards around the rim. One shadowBlur pass for the whole ring, not
        // one per shard — see the VFX rules in CLAUDE.md.
        ctx.rotate(this.crystalAngle);
        ctx.fillStyle = `rgba(180, 230, 255, ${0.8 * fade})`;
        ctx.shadowColor = '#88ddff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            const tip = this.radius * 1.1;
            const base = this.radius * 0.7;
            const mid = this.radius * 0.85;
            ctx.moveTo(cos * base, sin * base);
            ctx.lineTo(cos * mid - sin * 8, sin * mid + cos * 8);
            ctx.lineTo(cos * tip, sin * tip);
            ctx.lineTo(cos * mid + sin * 8, sin * mid - cos * 8);
            ctx.closePath();
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.rotate(-this.crystalAngle);

        // Inner ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150, 220, 255, ${0.6 * fade})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    }
}

export class FrostNovaWeapon extends Weapon {
    name = "Frost Nova";
    emoji = "❄️";
    description = "Freezing field dropped on the thickest part of the crowd.";

    readonly stats = {
        damage: 8,
        cooldown: 2.5,
        area: 120,
        speed: 0,
        duration: 3.0,
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

        const radius = this.area * this.owner.stats.area;
        const spot = this.findDensestSpot(SEARCH_RANGE, radius);
        // No crowd in range: chill the ground under the player instead of
        // wasting the cast — the field still buys space if something arrives
        const target: Vector2 = spot ?? { x: this.owner.pos.x, y: this.owner.pos.y };

        const lob = new LobbedProjectile(this.owner.pos.x, this.owner.pos.y, target, 0.6, '');
        lob.source = this;
        lob.height = 90;
        lob.color = this.evolved ? '#bfe9ff' : '#7fd8ff';
        lob.onLand = (x, y) => this.detonate(x, y, radius);
        this.onSpawn(lob);

        this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
    }

    private detonate(x: number, y: number, radius: number) {
        particles.emitFrost(x, y);
        const duration = this.duration * this.owner.stats.duration;

        if (this.evolved) {
            const zone = new AbsoluteZeroZone(x, y, radius, this.damage, duration);
            zone.freezeDuration = 0.6;
            zone.shatterDamage = this.damage * 4;
            zone.source = this;
            this.onSpawn(zone);
        } else {
            // Slow deepens with level: 50% at level 1 up to 80% at level 5
            const slow = Math.min(0.8, 0.5 + (this.level - 1) * 0.06);
            const zone = new FrostZone(x, y, radius, duration, this.damage, 0.5, slow);
            zone.source = this;
            this.onSpawn(zone);
        }
    }
}
