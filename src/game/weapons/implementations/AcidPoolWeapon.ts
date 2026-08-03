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
import { type Vector2 } from '../../../engine/Utils';
import { LobbedProjectile, AcidZone } from '../base';
import { particles } from '../../../engine/ParticleSystem';
import { status } from '../../core/StatusEffects';
import { juice } from '../../../engine/JuiceSystem';

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

    /**
     * A corroding pool draws no boundary of its own.
     *
     * This went through two rings — a marching dashed one, then a solid etched
     * one — and both were the same mistake: a circle stroked onto the floor is
     * a selection marker, and on a puddle that had already faded out it was the
     * *only* thing left on screen, a bright green outline sitting on empty
     * ground. What tells you where the acid reaches is the acid: the gradient
     * (AcidZone) and the mist coming off its edge.
     */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        super.draw(ctx, camera);
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
