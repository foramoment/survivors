/**
 * ACID POOL WEAPON
 *
 * Lobs a corrosive flask at the thickest part of the crowd. The puddle itself
 * is the small half of the weapon: what matters is that everything standing in
 * it gets **corroded** — it takes more damage from *every* source for a few
 * seconds afterwards (see core/StatusEffects). Acid is a setup tool, so it pays
 * off through whatever else you happen to be running.
 *
 * The old version threw at the single closest enemy with a `🧪` glyph and left
 * a puddle that did nothing but tick. Both are gone: it aims at the densest
 * cluster (`findDensestSpot`) and the flask is drawn, not stamped.
 *
 * Evolved — Toxic Deluge: three flasks in a spread that overlap into a lake,
 * stronger corrosion, and a lingering acid DoT on top of it.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { type Vector2 } from '../../core/Utils';
import { LobbedProjectile, AcidZone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { status } from '../../core/StatusEffects';
import { juice } from '../../core/JuiceSystem';

/** How far the weapon looks for a crowd to aim at */
const SEARCH_RANGE = 480;

// ============================================
// CORROSIVE POOL — puddle that softens targets up
// ============================================
export class CorrosivePool extends AcidZone {
    /** Extra damage the enemies standing here take from every source */
    corrosionAmp: number = 0.2;
    corrosionDuration: number = 3;
    /** Lingering acid damage-over-second (evolved only) */
    acidDps: number = 0;

    onOverlap(enemy: any) {
        super.onOverlap(enemy);
        status.corrode(enemy, { amp: this.corrosionAmp, duration: this.corrosionDuration });
        if (this.acidDps > 0) {
            status.infect(enemy, {
                dps: this.acidDps,
                duration: 2.5,
                source: this.source,
                kind: 'acid',
            });
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        super.draw(ctx, camera);

        // A bright acid line eaten into the floor, so a corroding pool reads
        // differently from a plain puddle.
        //
        // This used to be a marching dashed ring — which is a selection
        // indicator, not a puddle. It was the same offence as the dashed edge
        // we pulled off the spore patch: a UI element painted into the arena.
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#c9ff5c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

export class AcidPoolWeapon extends Weapon {
    name = "Acid Pool";
    emoji = "🧪";
    description = "Corrodes a crowd so everything else hits it harder.";

    readonly stats = {
        damage: 10,
        cooldown: 2.0,
        area: 80,
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
        // Aim at the pack, not at whoever is nearest
        const spot = this.findDensestSpot(SEARCH_RANGE, radius);
        if (!spot) return;

        if (this.evolved) {
            // Three flasks fanned around the cluster, staggered so the splashes
            // and their damage numbers land over a few frames rather than one
            const spread = radius * 0.85;
            const base = Math.random() * Math.PI * 2;
            for (let i = 0; i < 3; i++) {
                const angle = base + (i / 3) * Math.PI * 2;
                this.throwFlask(
                    { x: spot.x + Math.cos(angle) * spread, y: spot.y + Math.sin(angle) * spread },
                    0.7 + i * 0.05,
                    i * 0.09,
                );
            }
        } else {
            this.throwFlask(spot, 0.8, 0);
        }

        // Three flasks for the price of one throw was the evolution paying
        // nothing: same cooldown, triple the corrosion coverage. The deluge is
        // still far stronger, it just arrives less often.
        const cdMultiplier = this.evolved ? 1.6 : 1.0;
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
    }

    private throwFlask(target: Vector2, flight: number, delay: number) {
        const lob = new LobbedProjectile(this.owner.pos.x, this.owner.pos.y, target, flight, '');
        lob.source = this;
        lob.height = 70;
        lob.delay = delay;
        lob.kind = 'flask';
        lob.color = this.evolved ? '#b4ff3c' : '#5fe08a';
        lob.onLand = (x, y) => this.splash(x, y);
        this.onSpawn(lob);
    }

    private splash(x: number, y: number) {
        const radius = this.area * this.owner.stats.area * (this.evolved ? 0.8 : 1);

        particles.emitPoison(x, y);
        juice.shockwave(x, y, radius * 1.2, '#b4ff3c', 0.25, 3);

        const pool = new CorrosivePool(
            x, y,
            radius,
            this.duration * this.owner.stats.duration,
            this.damage * 0.5,
            Math.max(0.15, 0.5 * this.owner.stats.cooldown),
        );
        pool.source = this;

        if (this.evolved) {
            pool.corrosionAmp = 0.35;
            pool.corrosionDuration = 4;
            pool.acidDps = this.damage * 0.4;
        } else {
            // Level scales how much softer the target gets, not just the tick
            pool.corrosionAmp = 0.18 + this.level * 0.02;
            pool.corrosionDuration = 3;
        }

        this.onSpawn(pool);
    }
}
