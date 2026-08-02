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

    private readonly maxDuration: number;
    private frozen: Set<any> = new Set();
    private shattered: boolean = false;
    /** Uneven slab edge and the cracks running through it, baked once */
    private rim: Vector2[] = [];
    private cracks: Vector2[][] = [];

    constructor(x: number, y: number, radius: number, damage: number, duration: number) {
        super(x, y, radius, duration, damage, 0.5, '');
        this.maxDuration = duration;
        this.spreadIn(0.2);
        this.bakeIce();
    }

    /** A slab of ice: a jagged outline plus cracks spidering out of the middle */
    private bakeIce() {
        const r = this.fullRadius;
        const points = 14;
        for (let i = 0; i < points; i++) {
            const a = (i / points) * Math.PI * 2;
            const wobble = 0.88 + Math.random() * 0.2;
            this.rim.push({ x: Math.cos(a) * r * wobble, y: Math.sin(a) * r * wobble * 0.85 });
        }

        const crackCount = 5;
        for (let i = 0; i < crackCount; i++) {
            let angle = (i / crackCount) * Math.PI * 2 + Math.random() * 0.6;
            const steps = 3;
            const step = (r * (0.7 + Math.random() * 0.3)) / steps;
            const path: Vector2[] = [{ x: 0, y: 0 }];
            let x = 0;
            let y = 0;
            for (let s = 0; s < steps; s++) {
                angle += (Math.random() - 0.5) * 0.8;
                x += Math.cos(angle) * step;
                y += Math.sin(angle) * step * 0.85;
                path.push({ x, y });
            }
            this.cracks.push(path);
        }
    }

    update(dt: number) {
        super.update(dt);

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

    /**
     * A slab of ice frozen into the floor.
     *
     * The old version was a ring of eight triangles rotating slowly around the
     * centre, which read as a loading spinner sitting on the arena — and it was
     * the same shape whether the field had just landed or was about to shatter.
     * Ice does not spin: it spreads, cracks, and goes white just before it
     * breaks. That progression is the whole tell for when the shatter lands.
     */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const g = this.spreadScale;
        const fade = Math.max(0, Math.min(1, this.duration / Math.min(1, this.maxDuration)));
        // Goes glassy-white over the last third: the shatter is coming
        const strain = 1 - Math.max(0, Math.min(1, this.duration / (this.maxDuration * 0.35)));

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(g, g);

        // The slab itself
        ctx.beginPath();
        ctx.moveTo(this.rim[0].x, this.rim[0].y);
        for (let i = 1; i < this.rim.length; i++) ctx.lineTo(this.rim[i].x, this.rim[i].y);
        ctx.closePath();

        const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, this.fullRadius);
        floor.addColorStop(0, `rgba(226, 248, 255, ${(0.5 + 0.3 * strain) * fade})`);
        floor.addColorStop(0.6, `rgba(126, 205, 252, ${(0.34 + 0.2 * strain) * fade})`);
        floor.addColorStop(1, `rgba(60, 152, 224, ${0.12 * fade})`);
        ctx.fillStyle = floor;
        ctx.fill();

        // Hard rim — one pass, one glow (VFX rules in CLAUDE.md)
        ctx.strokeStyle = `rgba(232, 250, 255, ${0.9 * fade})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#88ddff';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Cracks: they open up as the field nears its end
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.3 + 0.6 * strain) * fade})`;
        ctx.lineWidth = 1 + 2 * strain;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const crack of this.cracks) {
            ctx.moveTo(crack[0].x, crack[0].y);
            for (let i = 1; i < crack.length; i++) ctx.lineTo(crack[i].x, crack[i].y);
        }
        ctx.stroke();

        // Frozen core
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.35 + 0.35 * strain) * fade})`;
        const core = this.fullRadius * 0.13;
        ctx.fillRect(-core, -core, core * 2, core * 2);

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
        lob.kind = 'cryo';
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
            // Slow deepens with level: 42% at level 1 up to 62% at level 5.
            // It used to reach 80%, and with duration and cooldown stacked the
            // field covered the ground permanently — enemies crawling at a
            // fifth of their speed forever is a stun without the stun's
            // downtime rule. Zone.SLOW_FLOOR backstops this at 65%.
            const slow = Math.min(0.62, 0.42 + (this.level - 1) * 0.05);
            const zone = new FrostZone(x, y, radius, duration, this.damage, 0.5, slow);
            zone.source = this;
            this.onSpawn(zone);
        }
    }
}
