/**
 * PHANTOM SLASH WEAPON
 *
 * The blade blinks to the nearest enemies and cuts them in one motion. Each
 * cut is a real swipe — an arc that sweeps through its own length over a few
 * frames — and a fading phantom trail connects the cuts so the sequence reads
 * as one dash.
 *
 * Evolved (Dimensional Blade): every cut tears a rift that slows and grinds
 * whatever stands in it.
 *
 * Both effects are drawn procedurally. The previous version stamped ⚔️ and 🌀
 * glyphs with fillText every frame, which is why a screen full of slashes cost
 * so much frame time — emoji glyph rasterisation is far more expensive than
 * the handful of strokes below.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { type Vector2, angleDelta } from '../../../engine/Utils';
import { Zone, Projectile } from '../base';
import type { Entity } from '../../../engine/Entity';
import { damageSystem } from '../../core/DamageSystem';
import { particles } from '../../../engine/ParticleSystem';

// ============================================
// SLASH ARC - the visible cut
// ============================================

export class SlashArc extends Projectile {
    private life: number;
    private readonly maxLife: number;
    private readonly angle: number;
    private readonly size: number;
    private readonly color: string;
    /** Where the blade came from — drawn as a fading phantom trail */
    private readonly from: Vector2 | null;

    constructor(x: number, y: number, angle: number, size: number, color: string, from: Vector2 | null = null) {
        super(x, y, { x: 0, y: 0 }, 0.3, 0, 0, '');
        this.canCollide = false;
        this.maxLife = 0.3;
        this.life = this.maxLife;
        this.angle = angle;
        this.size = size;
        this.color = color;
        this.from = from ? { ...from } : null;
    }

    update(dt: number) {
        this.life -= dt;
        if (this.life <= 0) this.isDead = true;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const p = 1 - this.life / this.maxLife;            // 0 → 1 over the swipe
        const fade = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35; // hold, then fade
        if (fade <= 0) return;

        ctx.save();
        ctx.lineCap = 'round';

        // Phantom trail from the previous cut — the blade's blink path
        if (this.from) {
            ctx.globalAlpha = 0.5 * fade * (1 - p * 0.5);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2.5;
            // A trail between two cuts, not a boundary around anything — it
            // shows the path the blade travelled and fades with the swing
            // ast-grep-ignore: no-ui-in-arena
            ctx.setLineDash([7, 6]);
            ctx.beginPath();
            ctx.moveTo(this.from.x - camera.x, this.from.y - camera.y);
            ctx.lineTo(this.pos.x - camera.x, this.pos.y - camera.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Pull the arc's centre back along the swing so the blade cuts
        // *through* the target instead of drawing a ring around it
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.rotate(this.angle);
        // Pulling back by exactly the arc radius puts the middle of the swing
        // right on the target
        ctx.translate(-this.size, 0);

        // The blade sweeps through its arc; the tail lags behind the head
        const sweep = 2.4;
        const ease = 1 - Math.pow(1 - Math.min(1, p / 0.55), 3);
        const head = -sweep / 2 + sweep * ease;
        const tail = Math.max(-sweep / 2, head - 1.3);

        // Wide soft body, then a bright core — a cheap way to fake a taper
        ctx.globalAlpha = 0.55 * fade;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * 0.26;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, tail, head);
        ctx.stroke();

        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, this.size * 0.11);
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, tail + 0.15, head);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Spark riding the leading edge
        if (p < 0.65) {
            ctx.globalAlpha = fade;
            ctx.fillStyle = '#ffffff';
            const hx = Math.cos(head) * this.size;
            const hy = Math.sin(head) * this.size;
            ctx.fillRect(hx - 3, hy - 3, 6, 6);
        }

        ctx.restore();
    }
}

// ============================================
// EVOLVED - DIMENSIONAL RIFT
// ============================================

export class DimensionalRiftZone extends Zone {
    private spin: number = 0;
    private pulse: number = Math.random() * Math.PI * 2;
    private readonly maxDuration: number;
    /** Spiral baked once in unit space, scaled at draw time */
    private readonly spiral: Vector2[] = [];

    constructor(x: number, y: number, radius: number, damage: number, duration: number = 1.4) {
        // slowEffect is handled by Zone.onOverlap — the old version wrote to a
        // `slowMultiplier` field that Enemy never reads, so it did nothing
        super(x, y, radius, duration, damage, 0.3, '', 0.45);
        this.maxDuration = duration;

        for (let a = 0; a <= Math.PI * 4; a += 0.22) {
            const r = a / (Math.PI * 4);
            this.spiral.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt * 3.4;
        this.pulse += dt * 5;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const fade = Math.max(0, Math.min(1, this.duration / this.maxDuration));
        if (fade <= 0) return;

        const scale = this.radius * (0.9 + Math.sin(this.pulse) * 0.06);

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Torn hole in space — kept translucent so enemies standing in it are
        // still readable
        const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        hole.addColorStop(0, `rgba(20, 0, 40, ${0.5 * fade})`);
        hole.addColorStop(0.6, `rgba(120, 40, 220, ${0.22 * fade})`);
        hole.addColorStop(1, 'rgba(150, 60, 255, 0)');
        ctx.fillStyle = hole;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.rotate(this.spin);

        // Twin spirals winding into the hole
        ctx.lineCap = 'round';
        for (let s = 0; s < 2; s++) {
            ctx.rotate(Math.PI);
            ctx.globalAlpha = fade * (s === 0 ? 0.9 : 0.55);
            ctx.strokeStyle = s === 0 ? '#e0b3ff' : '#8a3cff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let i = 0; i < this.spiral.length; i++) {
                const px = this.spiral[i].x * scale;
                const py = this.spiral[i].y * scale;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        // No dashed rim. A rift is a hole, and a hole does not have a drawn
        // border — the fill above already fades out where it ends.

        ctx.restore();
    }
}

/**
 * Half-angle of the sweep, in radians: 90° total, 140° once evolved.
 *
 * The blade used to cut whatever was nearest in any direction, so a volley
 * stacked into a ring around the player and read as an aura rather than swings.
 * The cone is aimed at the *nearest enemy*, not at where the player is walking:
 * tying it to movement would mean turning away from a pack to face it, which is
 * the opposite of what a defensive melee weapon should ask of you. Aiming is
 * automatic; the cone only decides how wide the cuts spread from there.
 */
const HALF_ARC = Math.PI / 3;
const HALF_ARC_EVOLVED = Math.PI * 0.39;
/** Random rotation added to each cut so a volley fans out instead of stacking */
const CUT_JITTER = 0.4;

/** Radius counted as "pressed against the player" for the crowd bonus */
const PRESSURE_RADIUS = 110;
/** Extra damage per enemy inside that radius, past the first */
const PRESSURE_PER_ENEMY = 0.14;
/** Ceiling on the bonus (+140% at ~11 bodies on top of you) */
const PRESSURE_CAP = 1.4;

export class PhantomSlashWeapon extends Weapon {
    name = "Phantom Slash";
    emoji = "⚔️";
    description = "Cuts harder the more enemies are pressed against you.";

    readonly stats = {
        damage: 15,
        cooldown: 1.5,
        // 250 was too far — the "melee" weapon cut things most of a screen away
        // and there was never a reason to let anything close. But 125 was too
        // short, and the reason is a trap worth remembering: the search radius
        // and the CONE multiply. At 125 the reach barely exceeded
        // PRESSURE_RADIUS, so the only candidates were bodies already touching
        // you, and then a 90-degree cone threw most of *those* away too. The
        // blade whiffed exactly when the crowd was thickest — the opposite of
        // what it is for.
        //
        // 170 keeps "let them get close" while leaving room for the cone (also
        // widened, to 120 degrees) to actually find the pack.
        area: 170,
        speed: 0,
        duration: 0.2,
        count: 3,
        countScaling: 1,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    /**
     * Melee's answer to area weapons.
     *
     * Lightning and Orbital Strike scale with crowd size for free — they hit
     * everything at once — while a blade that cuts three targets does not care
     * whether there are four enemies or forty. So the blade scales the other
     * way: the tighter the pack around *you*, the harder every cut lands. It is
     * strongest exactly when contact damage is killing you, which makes it the
     * tool you use to get out of a pile rather than a weaker Lightning.
     */
    private pressureMultiplier(): number {
        const packed = this.countEnemiesAround(PRESSURE_RADIUS * this.owner.stats.area);
        return 1 + Math.min(PRESSURE_CAP, Math.max(0, packed - 1) * PRESSURE_PER_ENEMY);
    }

    /** The blade always faces the nearest threat; the cone spreads from there */
    private aimAngle(nearest: Entity): number {
        return Math.atan2(nearest.pos.y - this.owner.pos.y, nearest.pos.x - this.owner.pos.x);
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        const isEvolved = this.evolved;
        const baseCount = this.stats.count + Math.floor((this.level - 1) * this.stats.countScaling);
        const count = isEvolved ? baseCount + 3 : baseCount;

        // Closest-first, then narrowed to the cone around the nearest of them
        const inRange = this.findEnemies({ mode: 'closest', count: count * 4 });
        if (inRange.length === 0) return;

        const facing = this.aimAngle(inRange[0]);
        const halfArc = isEvolved ? HALF_ARC_EVOLVED : HALF_ARC;
        const targets = inRange
            .filter(e => {
                const angle = Math.atan2(e.pos.y - this.owner.pos.y, e.pos.x - this.owner.pos.x);
                return Math.abs(angleDelta(angle, facing)) <= halfArc;
            })
            .slice(0, count);
        if (targets.length === 0) return;

        const pressure = this.pressureMultiplier();
        // A crowded swing reads hotter and cuts wider
        const color = isEvolved ? '#c58cff' : (pressure > 1.5 ? '#ffd27a' : '#c8f5ff');
        const areaScale = this.owner.stats.area * (1 + (pressure - 1) * 0.25);
        let previous: Vector2 = { ...this.owner.pos };

        targets.forEach((target, index) => {
            const result = damageSystem.dealDamage({
                baseDamage: this.damage * pressure,
                source: this,
                target,
                position: target.pos,
            });

            // Cuts shove the pack back — the blade has to actually make room
            const push = 190 * pressure;
            const dx = target.pos.x - this.owner.pos.x;
            const dy = target.pos.y - this.owner.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            (target as any).applyKnockback?.(dx / len, dy / len, push);

            // The cut faces the direction the blade travelled in, plus a little
            // scatter so a volley reads as several swings rather than one line
            const angle = Math.atan2(target.pos.y - previous.y, target.pos.x - previous.x)
                + (Math.random() - 0.5) * 2 * CUT_JITTER;
            const arc = new SlashArc(
                target.pos.x,
                target.pos.y,
                angle,
                (36 + this.level * 2.2) * areaScale,
                color,
                index === 0 ? null : previous,
            );
            this.onSpawn(arc);

            if (index < 3) particles.emitHit(target.pos.x, target.pos.y, color);

            if (isEvolved) {
                const rift = new DimensionalRiftZone(
                    target.pos.x,
                    target.pos.y,
                    46 * areaScale,
                    result.finalDamage * 0.22,
                    1.4 * this.owner.stats.duration,
                );
                rift.source = this;
                this.onSpawn(rift);
            }

            previous = { ...target.pos };
        });

        const cdMultiplier = isEvolved ? 1.25 : 1.0;
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
    }
}
