/**
 * NANOBOT SWARM WEAPON
 *
 * An escort of drones that orbit the player and dart out at whatever comes
 * near. One more drone every level, so the thing the name promises — a *swarm*
 * — is what it actually becomes.
 *
 * What this replaced, and why none of it was salvageable:
 *
 *  - **It was an aura with a duty cycle.** A 5s cloud on a 4s cooldown, ticking
 *    a flat number in a circle. So the weapon was *switched off* 44% of the
 *    time for no reason a player could see or influence, and the other 56% it
 *    was the least interesting thing in the pool — the file's own header said
 *    so. An always-on escort has no downtime to explain and no burst to
 *    balance around; its whole identity is that it never stops.
 *  - **Levels did nothing structural.** Drone count was hard-wired at 2, then 4
 *    on evolution. Every level in between bought ×1.2 on a number, which on a
 *    weapon whose damage arrives in dozens of small bites is invisible. Bodies
 *    are visible. That is the same trade Plasma Cannon and Lightning already
 *    make, and the reason this weapon takes a gentler `damageScaling` — it
 *    grows in drones, not in digits.
 *  - **Half the player's stats did not reach it.** Now every one of them lands
 *    somewhere the player can see: `cooldown` is how often a drone launches,
 *    `speed` is how fast it flies (so it is also how quickly it gets back to
 *    launch again), `area` is how far it will go hunting, `duration` is how
 *    long the rot it leaves keeps eating, and crit/might ride the normal
 *    DamageSystem path.
 *
 * Evolved — Nanite Hive: two more drones, and a sortie stops being a poke. The
 * drone picks a body and flies *through* it, carrying on past to strafe
 * everything on that line and seeding nanite rot in each. Aimed at one straggler
 * it is a small upgrade; aimed into a packed crowd it is the weapon.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { Entity } from '../../../engine/Entity';
import { type Vector2, distance, normalize } from '../../../engine/Utils';
import { levelSpatialHash } from '../../../engine/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { particles } from '../../../engine/ParticleSystem';
import { status } from '../../core/StatusEffects';

/** Collision radius of one drone */
const BOT_RADIUS = 9;
/** How close to its slot a returning drone has to get before it re-docks */
const DOCK_SNAP = 14;
/** Radians per second the formation turns */
const ORBIT_SPEED = 1.4;
/** Distance a drone bobs in and out of its slot, for a formation that breathes */
const ORBIT_BOB = 7;

/** One drone. Position is world space — a sortie leaves the player behind. */
interface Bot {
    pos: Vector2;
    /** Slot in the formation, in radians */
    slot: number;
    state: 'orbit' | 'out' | 'back';
    cooldown: number;
    /**
     * The point this sortie is flying at, baked at launch.
     *
     * Deliberately not the live target position: a drone that re-aims every
     * frame chases a fleeing enemy across the arena and never comes home, and
     * the strafe has no line to follow if the line keeps moving. Committing to
     * a point means a sortie can miss, which is the cost of the reach.
     */
    aim: Vector2;
    /** Bodies already struck on this sortie — a strafe hits each one once */
    struck: Set<any>;
}

// ============================================
// NANO SWARM - the escort itself
// ============================================

export class NanoSwarm extends Entity {
    private bots: Bot[] = [];
    private formation: number = 0;

    /**
     * Reads its numbers off the live weapon rather than off a config snapshot.
     *
     * The swarm outlives every level-up, so a snapshot would have to be
     * refreshed by hand every frame anyway — and the one time somebody forgets,
     * the drones silently keep the stats they were born with.
     */
    private readonly weapon: NanobotSwarmWeapon;
    private readonly player: Player;

    constructor(weapon: NanobotSwarmWeapon, player: Player) {
        super(player.pos.x, player.pos.y, 0);
        this.weapon = weapon;
        this.player = player;
        this.layer = 'air';
    }

    /** Drones grow with the weapon: one per level, two more for the hive */
    private get count(): number {
        return 1 + this.weapon.level + (this.weapon.evolved ? 2 : 0);
    }

    private get flightSpeed(): number {
        return this.weapon.speed * this.player.stats.speed * (this.weapon.evolved ? 1.25 : 1);
    }

    private get huntRadius(): number {
        return (170 + this.weapon.level * 8) * this.player.stats.area;
    }

    private get orbitRadius(): number {
        return 54 * this.player.stats.area;
    }

    /** How far past the target a strafing run carries on. 0 = stop at the body. */
    private get pierceLength(): number {
        return this.weapon.evolved ? 150 * this.player.stats.area : 0;
    }

    update(dt: number) {
        this.pos.x = this.player.pos.x;
        this.pos.y = this.player.pos.y;
        this.formation += dt * ORBIT_SPEED;
        this.syncCount();

        const interval = this.weapon.baseCooldown * this.player.stats.cooldown;

        for (const bot of this.bots) {
            switch (bot.state) {
                case 'orbit':
                    this.holdFormation(bot, dt);
                    bot.cooldown -= dt;
                    if (bot.cooldown <= 0) this.launch(bot, interval);
                    break;
                case 'out':
                    this.strike(bot);
                    if (this.fly(bot, bot.aim, dt)) bot.state = 'back';
                    break;
                case 'back':
                    if (this.fly(bot, this.slotPos(bot), dt)) {
                        bot.state = 'orbit';
                        bot.struck.clear();
                    }
                    break;
            }
        }
    }

    /**
     * Add or drop drones so the formation matches the weapon's level.
     *
     * New arrivals are spaced evenly and staggered, so a level-up does not fire
     * the whole swarm on the same frame — a wall of simultaneous damage numbers
     * is the thing the VFX rules exist to prevent.
     */
    private syncCount() {
        const want = this.count;
        while (this.bots.length < want) {
            const index = this.bots.length;
            this.bots.push({
                pos: { ...this.pos },
                slot: 0,
                state: 'orbit',
                cooldown: index * 0.12,
                aim: { x: 0, y: 0 },
                struck: new Set(),
            });
        }
        if (this.bots.length > want) this.bots.length = want;

        for (let i = 0; i < this.bots.length; i++) {
            this.bots[i].slot = (i / this.bots.length) * Math.PI * 2;
        }
    }

    /** Where this drone sits when it is not out on a run */
    private slotPos(bot: Bot): Vector2 {
        const angle = this.formation + bot.slot;
        const r = this.orbitRadius + Math.sin(this.formation * 2 + bot.slot) * ORBIT_BOB;
        return { x: this.pos.x + Math.cos(angle) * r, y: this.pos.y + Math.sin(angle) * r };
    }

    private holdFormation(bot: Bot, dt: number) {
        const slot = this.slotPos(bot);
        // Eased rather than snapped, so the formation drags behind a sprinting
        // player instead of being welded to them
        const k = Math.min(1, dt * 9);
        bot.pos.x += (slot.x - bot.pos.x) * k;
        bot.pos.y += (slot.y - bot.pos.y) * k;
    }

    /** Fly toward a point; true once it is there */
    private fly(bot: Bot, to: Vector2, dt: number): boolean {
        const dx = to.x - bot.pos.x;
        const dy = to.y - bot.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= DOCK_SNAP) return true;

        const step = Math.min(this.flightSpeed * dt, dist);
        bot.pos.x += (dx / dist) * step;
        bot.pos.y += (dy / dist) * step;
        return false;
    }

    private launch(bot: Bot, interval: number) {
        const target = this.findTarget();
        if (!target) {
            // Nothing in reach: check again shortly rather than burning the
            // whole interval, so the swarm reacts the moment a crowd arrives
            bot.cooldown = 0.15;
            return;
        }

        bot.cooldown = interval;
        bot.state = 'out';
        bot.struck.clear();

        const heading = normalize({ x: target.pos.x - bot.pos.x, y: target.pos.y - bot.pos.y });
        const reach = this.pierceLength;
        bot.aim = {
            x: target.pos.x + heading.x * reach,
            y: target.pos.y + heading.y * reach,
        };
    }

    /**
     * Damage whatever this drone is currently on top of.
     *
     * The base drone stops at the first body it reaches; the hive's carries on
     * to the end of its line. Both track what they have already hit, so a slow
     * pass over one enemy cannot tick it every frame.
     */
    private strike(bot: Bot) {
        const reach = BOT_RADIUS + 4;
        for (const enemy of levelSpatialHash.getWithinRadius(bot.pos, reach + 40)) {
            if (enemy.isDead || bot.struck.has(enemy)) continue;
            if (distance(bot.pos, enemy.pos) > reach + enemy.radius) continue;

            bot.struck.add(enemy);
            damageSystem.dealDamage({
                baseDamage: this.weapon.damage,
                source: this.weapon,
                target: enemy,
                position: enemy.pos,
            });
            particles.emitHit(enemy.pos.x, enemy.pos.y, '#66ffe0');

            if (this.weapon.evolved) {
                status.infect(enemy, {
                    dps: this.weapon.damage * 0.5,
                    duration: this.weapon.duration * this.player.stats.duration,
                    source: this.weapon,
                    kind: 'acid',
                });
            } else {
                // A single drone is a poke, not a charge: it turns for home the
                // moment it connects
                bot.state = 'back';
                return;
            }
        }
    }

    private findTarget(): any | null {
        let best: any = null;
        let bestDist = this.huntRadius;
        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, this.huntRadius)) {
            if (enemy.isDead) continue;
            const dist = distance(this.pos, enemy.pos);
            if (dist < bestDist) {
                bestDist = dist;
                best = enemy;
            }
        }
        return best;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        for (const bot of this.bots) {
            const x = bot.pos.x;
            const y = bot.pos.y;

            // Motion streak, pointing back the way it came
            if (bot.state !== 'orbit') {
                const back = normalize({ x: this.pos.x - x, y: this.pos.y - y });
                const sign = bot.state === 'out' ? 1 : -1;
                ctx.strokeStyle = 'rgba(102, 255, 224, 0.45)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + back.x * 18 * sign, y + back.y * 18 * sign);
                ctx.lineTo(x, y);
                ctx.stroke();
            }

            // Chunky pixel drone: dark hull, bright core, blinking sensor.
            // Deliberately bigger than a particle so it reads as a machine
            // rather than more sparkle.
            ctx.fillStyle = '#04201f';
            ctx.fillRect(x - 8, y - 6, 16, 12);
            ctx.fillStyle = '#0d5b57';
            ctx.fillRect(x - 6, y - 4, 12, 8);
            ctx.fillStyle = '#3ce8d0';
            ctx.fillRect(x - 4, y - 2, 8, 4);
            ctx.fillStyle = '#eaffff';
            ctx.fillRect(x - 1, y - 6, 2, 3);
            // Rotor stubs
            ctx.fillStyle = '#0d5b57';
            ctx.fillRect(x - 10, y - 1, 3, 2);
            ctx.fillRect(x + 7, y - 1, 3, 2);
        }

        ctx.restore();
    }
}

export class NanobotSwarmWeapon extends Weapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Escort drones that dart out at whatever comes near.";

    /**
     * Gentler than the usual 1.2 on purpose: this weapon also gains a whole
     * drone every level, and the two curves multiply. At 1.2 a level-6 hive
     * would be ×8.7 on the level-1 swarm before the evolution doubled it again.
     */
    protected damageScaling = 1.12;

    readonly stats = {
        damage: 20,
        /** Seconds a docked drone waits before its next sortie */
        cooldown: 0.6,
        area: 1.0,
        /** Flight speed, px/s — also how fast a drone gets home to launch again */
        speed: 620,
        /** Seconds of nanite rot the hive leaves in a strike */
        duration: 2.5,
    };

    private swarm: NanoSwarm | null = null;

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    /**
     * The escort is permanent, so all this does is make sure it exists. It is
     * respawned rather than resurrected if it ever dies, which is what happens
     * between runs when GameManager clears the entity list.
     */
    update(_dt: number) {
        if (this.swarm && this.swarm.isDead) this.swarm = null;
        if (this.swarm) return;

        this.swarm = new NanoSwarm(this, this.owner);
        this.onSpawn(this.swarm);
    }
}
