import { Entity } from '../../engine/Entity';
import { type Vector2, normalize, distance } from '../../engine/Utils';
import { input } from '../../engine/Input';
import { Weapon } from '../Weapon';
import { sprites } from '../core/SpriteFactory';
import { REGEN_COMBAT_DELAY, SHIELD_RECHARGE_DELAY, SHIELD_REFILL_TIME } from '../core/Tactics';
import { armorMultiplier, CONTACT_RAMP_FULL, CONTACT_RAMP_DECAY } from '../core/ContactDamage';
import type { ClassPerLevel } from '../data/GameData';
import { addStat } from '../core/PlayerStats';

export class Player extends Entity {
    /**
     * Level at which the XP curve stops compounding and starts growing by a
     * fixed step instead.
     *
     * The old curve was `x1.1 + 6` forever. XP *income* cannot compound — it is
     * bounded by `DifficultyDirector.MAX_ENEMIES` (the population ceiling on
     * the arena) and by how fast a build can delete them — so a geometric
     * requirement against a sublinear income diverges by construction. Measured
     * on a real 15-minute Void Nexus clear: level 69 cost 35,893 XP, about 1100
     * kills, **93 seconds**, and the next one was 10% worse again. Which is the
     * reported feeling — the late game stops handing out decisions.
     *
     * Everything below level 40 is byte-for-byte the curve it always was. That
     * matters: the opening minutes were tuned and are not the complaint. A
     * ten-minute Asteroid Fields run barely reaches the transition at all, so
     * this is a change to long runs on hard stages and to nothing else.
     */
    static readonly XP_LINEAR_FROM = 40;

    /**
     * Flat XP added to each level's cost past `XP_LINEAR_FROM`.
     *
     * This is the increment the compounding curve *already had* at level 40
     * (2437 -> 2686, so 249, rounded), which is the whole point: the curve does
     * not kink at the transition, it just stops accelerating. The cost still
     * rises every level — a level near the end of the longest run in the game
     * lands around 34 seconds instead of 93 — so late levels remain something
     * you earn, not something the clock hands you.
     */
    static readonly XP_LINEAR_STEP = 250;

    /**
     * How much the step itself grows per level past the transition.
     *
     * The flat step was half a fix. It got the shape right — a compounding
     * requirement against a bounded income diverges by construction — and then
     * overshot into the other failure: a *constant* step against an income that
     * still rises with the clock means levels arrive faster and faster, and a
     * run that is going well simply drains the upgrade pool. Measured: a
     * 15-minute Void Nexus clear reached level 111 and had taken 110 of the 120
     * picks that exist in the game. There was nothing left to offer.
     *
     * Income over a run is roughly linear in time (bounded by
     * `DifficultyDirector.MAX_ENEMIES` and rising with enemy tier), so the cost
     * that matches it is a linearly growing step — quadratic total, sitting
     * exactly between the flat line that empties the pool and the geometric
     * curve that charged 93 seconds a level and stopped handing out decisions.
     *
     * What it does to the three measured runs:
     *
     *     died at 9:00, 55,487 XP     ->  49  (unchanged, the tail never starts)
     *     cleared 15:24, 355,140 XP   ->  76  (was 83)
     *     the 600-enemy run, 816,346  ->  95  (was 111)
     *
     * At level 80 a level costs about 25 seconds of a strong run's income
     * rather than 14, which is still a decision every half-minute.
     */
    static readonly XP_STEP_GROWTH = 10;

    /**
     * Pickup radius gained per level, on top of the base 100.
     *
     * Magnet range used to be a powerup (Gravity Well, +25 a pick, six picks).
     * It was the clearest junk card in the pool: crystals never despawn, so
     * range buys *convenience* and nothing else, yet it competed for draft
     * space at exactly the same weight as raw damage. A real run spent three of
     * its nineteen perk picks on it.
     *
     * Handing it out per level deletes the card and keeps the effect. At level
     * 50 this is +100 — four of the old picks' worth — and it costs nothing,
     * so no run is ever again worse for refusing to buy convenience.
     */
    static readonly MAGNET_PER_LEVEL = 2;

    /**
     * Base move speed in px/s. Enemies run at 40–120 (see ENEMY_CONFIG), so
     * even at 190 the player is comfortably faster than anything on the map —
     * the threat is the number of directions they come from, not their pace.
     * Trimmed from 200 alongside the move-speed nerfs, not instead of them.
     */
    speed: number = 190;
    hp: number = 100;
    maxHp: number = 100;
    xp: number = 0;
    level: number = 1;
    nextLevelXp: number = 4;

    weapons: Weapon[] = [];

    // Invulnerability system — discrete hits only (see takeDamage)
    invulnerabilityTimer: number = 0;
    invulnerabilityDuration: number = 0.5;

    /** Seconds left of the "enemies are on me" tint; refreshed while in contact */
    contactTimer: number = 0;
    /** Seconds left before regeneration may resume (see REGEN_COMBAT_DELAY) */
    regenDelay: number = 0;
    /**
     * Seconds of unbroken contact, which drives the standing-still ramp.
     *
     * Owned by the player rather than by the enemies, because the thing being
     * measured is *how long you chose to stand there* — swapping which bodies
     * are touching you must not reset it. That distinction is exactly what the
     * per-enemy timers got wrong: a pile shoves itself around constantly, so
     * anything keyed to individual attackers leaks.
     */
    contactRampTime: number = 0;

    /**
     * Absorb buffer left, in HP. `stats.shield` is the maximum.
     *
     * Deliberately NOT a third flavour of survivability on top of armour and
     * regeneration — it does a job neither of them can. Armour is a percentage
     * and regen is a trickle that only runs between fights; both of them
     * reward *not being here*. A buffer that refills only out of contact makes
     * **diving** repeatable: you can spend it walking through a pile and get it
     * back by leaving, which is the exact play that killed a run at nine
     * minutes ("walked into the crowd by accident").
     *
     * It is small on purpose — see the powerup entry in GameData. The one
     * thing it must never do is refill while a crowd is on you: that is the
     * "standing still is free" failure the whole contact model exists to
     * prevent, and `shieldDelay` is what stops it.
     */
    shield: number = 0;
    /** Seconds before the buffer may refill; reset by any damage at all */
    shieldDelay: number = 0;
    /** Fired when the buffer runs out, so the break can be seen and heard */
    onShieldBreak: () => void = () => { };

    // Knockback system
    knockback: Vector2 = { x: 0, y: 0 };

    // Stats modifiers
    stats = {
        might: 1,
        area: 1,
        cooldown: 1,
        speed: 1,
        duration: 1,
        moveSpeed: 1,
        magnet: 100,
        growth: 1,
        armor: 0,
        regen: 0,
        critChance: 0,
        critDamage: 2,
        /** Maximum absorb buffer in HP (see `shield` above) */
        shield: 0,

        // Tactics — behaviour switches, not multipliers (see core/Tactics.ts)
        /** Capacitor stacks: absorbed damage detonates around the player */
        discharge: 0,
        /** Chance a killed enemy detonates */
        killEcho: 0,
        /** Chance a kill drops a repair cell */
        siphon: 0,
        /** Extra level-up rerolls on top of the free one */
        reroll: 0,
        /** Bonus damage against a target still at full health */
        firstStrike: 0,
    };

    classId: string = 'void_walker';
    className: string = "Survivor";
    classEmoji: string = "🧑‍🚀";
    /** Class HP before any per-level growth — the base for the maxHp perk */
    baseMaxHp: number = 100;
    /** Stat this class grows on every level-up (see GameData CLASSES) */
    perLevel: ClassPerLevel | null = null;

    animTimer: number = 0;
    /** Always-advancing clock for effects that must animate while standing still */
    pulseClock: number = 0;
    isMoving: boolean = false;
    facingLeft: boolean = false;

    onLevelUp: () => void = () => { };
    /** Every source of healing reports through here, so the run can total it */
    onHeal: (amount: number) => void = () => { };

    /**
     * Restore HP, capped at the maximum, and report what actually landed.
     * Overheal is not healing — a full-HP player picking up a repair cell got
     * nothing, and the run summary should say so.
     */
    heal(amount: number): void {
        if (amount <= 0 || this.hp >= this.maxHp) return;
        const restored = Math.min(amount, this.maxHp - this.hp);
        this.hp += restored;
        this.onHeal(restored);
    }

    constructor(x: number, y: number) {
        super(x, y, 15);
    }

    /**
     * Damage multiplier including conditional bonuses.
     *
     * DamageSystem reads this rather than `stats.might` directly, so anything
     * that boosts damage situationally has exactly one place to live. Nothing
     * does right now — Adrenal Surge was the only such source and it is gone —
     * but the seam is where the next one goes.
     */
    get effectiveMight(): number {
        return this.stats.might;
    }

    /**
     * Apply knockback force to player
     */
    applyKnockback(dirX: number, dirY: number, force: number) {
        this.knockback.x += dirX * force;
        this.knockback.y += dirY * force;
    }

    update(dt: number) {
        let moveDir: Vector2 = { x: 0, y: 0 };

        // WASD Input
        const axis = input.getAxis();
        if (axis.x !== 0 || axis.y !== 0) {
            moveDir = normalize(axis);
        }
        // Mouse Movement (if holding click)
        else if (input.isMouseDown) {
            const centerScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const dirToMouse = {
                x: input.mousePos.x - centerScreen.x,
                y: input.mousePos.y - centerScreen.y
            };

            if (distance({ x: 0, y: 0 }, dirToMouse) > 10) {
                moveDir = normalize(dirToMouse);
            }
        }

        this.pulseClock += dt;
        this.isMoving = moveDir.x !== 0 || moveDir.y !== 0;
        if (this.isMoving) this.animTimer += dt;
        if (moveDir.x !== 0) this.facingLeft = moveDir.x < 0;

        const moveSpeed = this.speed * this.stats.moveSpeed;
        let moveX = moveDir.x * moveSpeed;
        let moveY = moveDir.y * moveSpeed;

        // Add knockback
        moveX += this.knockback.x;
        moveY += this.knockback.y;

        this.pos.x += moveX * dt;
        this.pos.y += moveY * dt;

        // Decay knockback (friction)
        const knockbackDecay = 0.85;
        this.knockback.x *= knockbackDecay;
        this.knockback.y *= knockbackDecay;

        if (Math.abs(this.knockback.x) < 1) this.knockback.x = 0;
        if (Math.abs(this.knockback.y) < 1) this.knockback.y = 0;

        // Regeneration: a fraction of MISSING health per second, and only once
        // you have been left alone for a moment.
        //
        // Percent-of-missing is the shape that makes the stat worth taking —
        // it is strongest exactly when you are hurt and costs nothing at full
        // health, and it is worth the same to a 100 HP character as to a 300 HP
        // one, which flat regen never was. The out-of-combat gate is what keeps
        // it from turning back into "standing still is free"; see
        // REGEN_COMBAT_DELAY for the full argument.
        if (this.regenDelay > 0) {
            this.regenDelay -= dt;
        } else if (this.stats.regen > 0 && this.hp < this.maxHp) {
            this.heal(this.stats.regen * (this.maxHp - this.hp) * dt);
        }

        // The absorb buffer refills only once nothing has touched you for
        // SHIELD_RECHARGE_DELAY. That gate is the entire balance of the perk:
        // it can pay for a dive out of a crowd and can never pay for standing
        // in one.
        if (this.shieldDelay > 0) {
            this.shieldDelay -= dt;
        } else if (this.shield < this.stats.shield) {
            this.shield = Math.min(
                this.stats.shield,
                this.shield + (this.stats.shield / SHIELD_REFILL_TIME) * dt,
            );
        }

        // Update invulnerability timer
        if (this.invulnerabilityTimer > 0) {
            this.invulnerabilityTimer -= dt;
        }
        if (this.contactTimer > 0) {
            this.contactTimer -= dt;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Shadow
        ctx.beginPath();
        ctx.ellipse(0, 10, 10, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Apply flashing effect if invulnerable
        if (this.invulnerabilityTimer > 0) {
            // Oscillate alpha between 0.3 and 1.0 using sine wave
            const flashSpeed = 15; // How fast the flashing occurs
            const alpha = 0.65 + 0.35 * Math.sin(this.invulnerabilityTimer * flashSpeed);
            ctx.globalAlpha = alpha;
        }

        // Procedural pixel sprite (per-class template, red while taking contact
        // damage). The flash is the whole "you are being hurt" signal: an
        // earlier version drew a pulsing ring around the player instead, which
        // read as a perk indicator rather than damage.
        const frame = this.isMoving ? Math.floor(this.animTimer * 8) % 2 : 0;
        const hurt = this.contactTimer > 0 && Math.sin(this.pulseClock * 22) > -0.2;
        const sprite = sprites.getPlayerSprite(this.classId, frame, hurt);
        const height = this.radius * 2.6;
        const width = height * (sprite.width / sprite.height);
        const bob = this.isMoving ? Math.sin(this.animTimer * 16) * 1.2 : 0;

        ctx.imageSmoothingEnabled = false;
        if (this.facingLeft) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -width / 2, -height / 2 + bob, width, height);
        if (this.facingLeft) ctx.scale(-1, 1);

        ctx.globalAlpha = 1.0; // Reset alpha

        // Draw Line to cursor if mouse down
        if (input.isMouseDown) {
            const mouseWorld = {
                x: input.mousePos.x + camera.x,
                y: input.mousePos.y + camera.y
            };

            ctx.beginPath();
            ctx.moveTo(0, 0); // Relative to player
            ctx.lineTo(mouseWorld.x - this.pos.x, mouseWorld.y - this.pos.y);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    /**
     * A discrete hit: meteors, rift collapses, boss slams. Grants i-frames so a
     * single event cannot chain-hit, and floors at 1 so a hazard always stings.
     *
     * Enemy contact does NOT go through here — see takeContact.
     */
    takeDamage(amount: number) {
        // Check if player is currently invulnerable
        if (this.invulnerabilityTimer > 0) {
            return; // No damage taken
        }

        // Armour is a curve, not a subtraction — the same one contact damage
        // uses, so a defensive build is worth the same against a meteor as
        // against a crowd.
        const damage = Math.max(1, amount * armorMultiplier(this.stats.armor));
        this.regenDelay = REGEN_COMBAT_DELAY;

        // Activate invulnerability — even a fully absorbed hit spends the
        // i-frames, or a shielded player would eat the follow-up ticks of the
        // same event that an unshielded one is protected from.
        this.invulnerabilityTimer = this.invulnerabilityDuration;

        this.hp -= this.absorb(damage);

        if (this.hp <= 0) {
            this.isDead = true;
        }
    }

    /**
     * Spend the absorb buffer, and return what is left over for health.
     *
     * Every path that hurts the player goes through here, so a hazard and a
     * crowd cannot disagree about what the shield covers. It also always resets
     * `shieldDelay`, including when there is no buffer left to spend — being
     * hit is what stops the refill, not being hit *through* the shield.
     */
    private absorb(amount: number): number {
        this.shieldDelay = SHIELD_RECHARGE_DELAY;
        if (this.shield <= 0 || amount <= 0) return amount;

        const used = Math.min(this.shield, amount);
        this.shield -= used;
        if (this.shield <= 0) {
            this.shield = 0;
            this.onShieldBreak();
        }
        return amount - used;
    }

    /**
     * This frame's share of the contact drain.
     *
     * **No i-frames, deliberately.** They would cap crowd damage at
     * 1/invulnerabilityDuration regardless of how many enemies were touching
     * you, which is exactly what used to make standing in a swarm free.
     *
     * Armour and the standing-still ramp are already applied by the caller —
     * this only spends the health.
     *
     * Returns the HP actually lost, which is *not* the amount passed in once a
     * shield is in play. The caller needs the difference: the run's "damage
     * taken" total and the number printed over the player's head must both be
     * what the health bar did, or the shield reads as broken.
     *
     * Note what is deliberately NOT here: the contact ramp. It advances in
     * `updateContactRamp` from whether anything is touching you, not from
     * whether that contact reached your health — so a shielded player standing
     * in a pile is still building the multiplier that kills them when it pops.
     */
    takeContact(amount: number): number {
        if (amount <= 0) return 0;

        this.regenDelay = REGEN_COMBAT_DELAY;
        this.contactTimer = 0.16; // drives the "being chewed" tint in draw()

        const toHealth = this.absorb(amount);
        if (toHealth <= 0) return 0;

        this.hp -= toHealth;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
        return toHealth;
    }

    /**
     * Advance the standing-still ramp. Called once a frame with whether
     * anything is currently touching the player.
     *
     * Decay is scaled so a full ramp sheds in `CONTACT_RAMP_DECAY` seconds
     * regardless of how long it took to build — leaving is always a fixed,
     * knowable amount of relief, and dipping back in does not start from zero
     * the way a hard reset would (which would make jittering in and out of
     * contact strictly better than committing to a direction).
     */
    updateContactRamp(touching: boolean, dt: number) {
        if (touching) {
            this.contactRampTime = Math.min(this.contactRampTime + dt, CONTACT_RAMP_FULL);
        } else {
            this.contactRampTime = Math.max(
                0,
                this.contactRampTime - dt * (CONTACT_RAMP_FULL / CONTACT_RAMP_DECAY),
            );
        }
    }

    /**
     * The class's per-level growth. Multiplier stats (might/area/cooldown) take
     * the value as a share of their base of 1, so +0.01 really is +1% of the
     * starting value and fifty levels land near +50% — not a compounding curve
     * that runs away. `maxHp` is special-cased because it is a property, not a
     * stat, and grows off the CLASS's HP rather than the current maximum, so
     * Barrier Field picks do not multiply with it.
     */
    private applyClassGrowth() {
        if (!this.perLevel) return;

        if (this.perLevel.stat === 'maxHp') {
            const gain = this.baseMaxHp * this.perLevel.value;
            this.maxHp += gain;
            this.hp = Math.min(this.maxHp, this.hp + gain);
            return;
        }

        const stats = this.stats as Record<string, number>;
        if (this.perLevel.stat in stats) {
            // Shared with the powerup path: limits and the crit-overflow
            // conversion live in one place, so a Berserker past 100% crit keeps
            // gaining something instead of gaining nothing
            addStat(stats, this.perLevel.stat, this.perLevel.value);
        }
    }

    /**
     * One pickup can be worth more than one level, and used to pay out only
     * the first: a single crystal from a black-hole pile could carry ten times
     * the bar, and the remaining nine levels sat in the bank until nine more
     * crystals happened to be walked over. Levels arrived long after the XP
     * that bought them, which is exactly when the player is no longer in a
     * position to spend them.
     *
     * The overlay queues the panels, so paying out the whole debt here is safe.
     */
    gainXp(amount: number) {
        this.xp += amount * this.stats.growth;
        while (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.xp -= this.nextLevelXp;
        this.applyClassGrowth();
        // Pickup range is a per-level freebie now rather than a card you have
        // to buy — see MAGNET_PER_LEVEL
        addStat(this.stats, 'magnet', Player.MAGNET_PER_LEVEL);

        // XP curve: compounding, then linear.
        //
        // Up to XP_LINEAR_FROM it is the curve it always was — starts at 4 and
        // grows ~×1.1 + 6: 4, 10, 17, 25, 33, 42, 52, 63, 75, 88 … — a steady
        // cadence instead of the burst-then-drought the ×1.15 curve gave.
        //
        // Past it the cost grows by a fixed step, because income cannot
        // compound and a compounding requirement therefore runs away from it.
        // See XP_LINEAR_FROM for the measurement that forced this.
        //
        // The step grows by XP_STEP_GROWTH each level, starting at zero growth
        // on the first linear level so the transition still does not kink.
        this.nextLevelXp = this.level <= Player.XP_LINEAR_FROM
            ? Math.floor(this.nextLevelXp * 1.1 + 6)
            : this.nextLevelXp + Player.XP_LINEAR_STEP
                + Player.XP_STEP_GROWTH * (this.level - Player.XP_LINEAR_FROM - 1);

        this.onLevelUp();
    }
}
