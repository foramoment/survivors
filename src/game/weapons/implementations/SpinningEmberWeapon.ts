/**
 * BLOOD CLEAVER — the Berserker's weapon.
 *
 * It used to be Spinning Ember: a permanent ring of orbiting embers. The ring
 * was fine and it belonged to nobody. The Berserker is built entirely around
 * fighting hurt — +50% HP, **minus** two armour, and an Adrenal Surge that only
 * switches on below 35% health — and a halo of fire orbiting your body says
 * nothing about any of that. The class asked a question its own weapon did not
 * answer.
 *
 * So the cleaver answers it: a heavy sweep around the player whose damage rises
 * with **how much health you are missing**. At full HP it is an ordinary swing.
 * Bleeding out, it is the hardest hit in the game. Everything the class already
 * gives you — the missing armour, the huge pool to spend, the adrenaline
 * threshold — now points the same direction, and the whole character reads as
 * one idea: get hurt, hit harder, do not die.
 *
 * It also shoves what it hits, because a class that wants to be surrounded
 * still needs to be able to breathe.
 *
 * Evolved — Ruin: the sweep lands twice and leaves the ground burning where it
 * passed.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { BurningTrailZone, Projectile } from '../base';
import type { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { status } from '../../core/StatusEffects';

export { BurningTrailZone };

/**
 * Bonus damage at zero health, as a multiplier on top of the base swing.
 *
 * 1.6 means a Berserker at the Adrenal Surge threshold (35% HP) is swinging for
 * roughly 2x, and one about to die for 2.6x. Deliberately large: this is the
 * only place in the game that pays you for being nearly dead, and a timid
 * number here would just be a worse version of every other damage stat.
 */
const MISSING_HP_SCALE = 1.6;

// ============================================
// CLEAVE ARC - the visual of one swing
// ============================================

/**
 * A crescent sweeping around the player. Baked as one arc and animated by
 * angle and alpha only, so a swing costs two strokes however wide it is.
 *
 * It extends Projectile (collision disabled) rather than Entity because
 * `GameManager.spawnEntity` only keeps Projectiles and Zones — anything else is
 * dropped on the floor without a word. That is exactly how this weapon shipped
 * invisible: the damage landed, the particles fired, and the swing itself was
 * never added to the world at all.
 *
 * The arc rides the player instead of standing where the swing started: at
 * 190 px/s you walk most of a reach away inside its 0.26s life, and a crescent
 * left behind reads as something you dropped rather than something you swung.
 */
export class CleaveArc extends Projectile {
    private age: number = 0;
    private readonly life: number = 0.26;
    private readonly reach: number;
    private readonly hot: number;
    private readonly anchor: Entity;

    constructor(anchor: Entity, reach: number, hot: number) {
        super(anchor.pos.x, anchor.pos.y, { x: 0, y: 0 }, 0.26, 0, 0, '');
        this.canCollide = false;
        this.radius = reach;
        this.anchor = anchor;
        this.reach = reach;
        this.hot = hot;
    }

    update(dt: number) {
        this.pos.x = this.anchor.pos.x;
        this.pos.y = this.anchor.pos.y;
        this.age += dt;
        if (this.age >= this.life) this.kill();
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const t = Math.min(1, this.age / this.life);
        const alpha = 1 - t;
        if (alpha <= 0) return;

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // The crescent travels the full circle over the swing
        const head = t * Math.PI * 2.2;
        const tail = Math.max(0, head - 2.1);
        // Sized so the *outer* edge of the band lands on `reach` at the end of
        // the swing — the blur has to stop where the damage stops, or the swing
        // keeps missing things it visibly covered
        const r = this.reach * (0.55 + 0.28 * t);

        // Hotter the more wounded the swing was — the read is "this one hurt"
        const glow = `rgba(255, ${Math.round(120 - 70 * this.hot)}, ${Math.round(90 - 60 * this.hot)}, `;

        ctx.lineCap = 'butt';
        ctx.strokeStyle = `${glow}${(0.35 * alpha).toFixed(3)})`;
        ctx.lineWidth = this.reach * 0.34;
        ctx.beginPath();
        ctx.arc(0, 0, r, tail, head);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 240, 220, ${(0.9 * alpha).toFixed(3)})`;
        ctx.lineWidth = Math.max(2, this.reach * 0.07);
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.max(tail, head - 0.5), head);
        ctx.stroke();

        ctx.restore();
    }
}

export class SpinningEmberWeapon extends Weapon {
    name = "Blood Cleaver";
    emoji = "🔥";
    description = "A heavy sweep that hits harder the more health you are missing.";

    readonly stats = {
        damage: 30,
        cooldown: 1.4,
        area: 110,
        speed: 0,
        duration: 1,
    };

    /** How hard a hit shoves — the class needs room as much as it needs damage */
    private static readonly KNOCKBACK = 210;

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    /** Reach grows with level as well as with the area stat */
    private reach(): number {
        return this.area * this.owner.stats.area * (1 + (this.level - 1) * 0.07);
    }

    /** 0 at full health, 1 at death's door */
    private wounded(): number {
        const max = this.owner.maxHp || 1;
        return Math.max(0, Math.min(1, 1 - this.owner.hp / max));
    }

    /** Seconds until Ruin's follow-up lands; <= 0 means nothing pending */
    private pendingSecond: number = 0;

    /** Is there anything alive close enough to be worth a swing? */
    private anyoneInReach(): boolean {
        const reach = this.reach();
        for (const enemy of levelSpatialHash.getWithinRadius(this.owner.pos, reach)) {
            if (!enemy.isDead && distance(this.owner.pos, enemy.pos) <= reach) return true;
        }
        return false;
    }

    update(dt: number) {
        // Ruin's follow-up runs on its own countdown, before the cooldown gate,
        // so it lands whether or not the next swing is ready
        if (this.pendingSecond > 0) {
            this.pendingSecond -= dt;
            if (this.pendingSecond <= 0) this.swing(this.wounded(), 0.7);
        }

        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        // A cleaver swings at bodies, not at empty air. The swing is *held*
        // rather than spent, so the first thing to walk into reach eats it on
        // the spot — same rule Phantom Slash uses, and the reason melee feels
        // like melee instead of a metronome.
        if (!this.anyoneInReach()) return;

        this.swing(this.wounded());
        if (this.evolved) {
            // Ruin lands a second time a beat later, so the pair reads as one
            // heavy combination rather than a doubled number
            this.pendingSecond = 0.18;
        }

        this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
    }

    private swing(hot: number, scale: number = 1) {
        const reach = this.reach();
        const multiplier = (1 + hot * MISSING_HP_SCALE) * scale;

        const arc = new CleaveArc(this.owner, reach, hot);
        this.onSpawn(arc);
        particles.emitShrapnel(this.owner.pos.x, this.owner.pos.y, reach * 0.5,
            ['#ffdccc', '#ff6b35', '#b32020'], 5);

        let struck = 0;
        for (const enemy of levelSpatialHash.getWithinRadius(this.owner.pos, reach)) {
            if (enemy.isDead || distance(this.owner.pos, enemy.pos) > reach) continue;

            damageSystem.dealDamage({
                baseDamage: this.damage * multiplier,
                source: this,
                target: enemy,
                position: enemy.pos,
            });

            const dx = enemy.pos.x - this.owner.pos.x;
            const dy = enemy.pos.y - this.owner.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            enemy.applyKnockback(dx / len, dy / len, SpinningEmberWeapon.KNOCKBACK);

            if (struck < 4) {
                struck++;
                particles.emitHit(enemy.pos.x, enemy.pos.y, '#ff6b35');
            }

            if (this.evolved) {
                status.infect(enemy, {
                    dps: this.damage * 0.18,
                    duration: 2,
                    source: this,
                    kind: 'burn',
                });
            }
        }

        // Ruin scorches the ground it swept
        if (this.evolved) {
            const fire = new BurningTrailZone(
                this.owner.pos.x, this.owner.pos.y,
                reach * 0.8,
                1.8 * this.owner.stats.duration,
                this.damage * 0.1,
            );
            fire.burnDps = this.damage * 0.16;
            fire.source = this;
            this.onSpawn(fire);
        }
    }
}
