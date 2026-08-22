/**
 * TACTICS — powerups that change how the run plays instead of moving a number.
 *
 * The powerup pool used to be fourteen flat multipliers. Picking one never
 * changed a decision: +8% might and +9% area are the same card wearing
 * different hats, and one of them (projectile speed) was not even perceptible.
 * These have a behaviour attached, so a build starts to have a shape.
 *
 *   Static Discharge — contact damage charges a capacitor that detonates
 *                      around you. The one perk that turns being surrounded
 *                      into an advantage.
 *   Kill Echo        — kills sometimes detonate. Rewards clearing fast.
 *   Vital Siphon     — kills sometimes drop a repair pickup. Healing you have
 *                      to walk to, so it can never turn into standing still.
 *   Second Wind      — one lethal blow a run is survived, and the save clears
 *                      the ground you died on.
 *   Stasis           — the arena periodically stops. Hands you time, which is
 *                      the resource nothing else in the pool gives.
 *   Salvo            — every weapon you own fires at once. The only perk that
 *                      makes your WEAPON picks matter more instead of less.
 *
 * The last three deal no damage at all, and that is a rule rather than an
 * accident: a measured 17-minute clear had two perks holding 89% of the run's
 * damage while five weapons split 11%, so a fourth source of perk damage was
 * exactly the wrong medicine.
 *
 * The numbers live here rather than in GameData so the balance of a mechanic
 * sits next to the rule it drives.
 */

/**
 * ## Static Discharge stacks unlock behaviour, they do not scale a number
 *
 * Three picks, and each one adds a *thing the blast does*:
 *
 *   1. **Shove** — damage and knockback. The pack comes off you.
 *   2. **Stun** — and it stays off you, for DISCHARGE_STUN seconds.
 *   3. **Burn** — and it walks away on fire.
 *
 * The player's objection was structural rather than numeric: "I don't much
 * like that we're taking stacks of this thing." They were right, and this perk
 * is the one where it stings most. It sits in the file whose opening comment
 * says these are *tactics* — powerups with a behaviour attached, so a build
 * starts to have a shape — and then asked to be bought eight times for a
 * larger version of the same event. Eight picks of +damage is the flat
 * multiplier this file exists to be an alternative to.
 *
 * Tiers also fix something the old shape could not. A rate-capped blast has a
 * hard ceiling on damage per second no matter what the number says (see
 * DISCHARGE_COOLDOWN), so late stacks ran into that wall. Stun and burn are
 * not damage per second, so they keep paying after the damage stops mattering.
 */
export const DISCHARGE_MAX_STACKS = 3;
/** Stack at which the blast starts stunning, and at which it starts burning */
export const DISCHARGE_STUN_AT = 2;
export const DISCHARGE_BURN_AT = 3;
/** How long the caught pack is held, and how long it burns */
export const DISCHARGE_STUN = 0.9;
export const DISCHARGE_BURN_TIME = 3;
/**
 * Burn strength, as a share of the target's own max HP per second.
 *
 * Cut 0.06 -> 0.02 for the same reason as KILL_ECHO_BURN_SHARE — see there for
 * the measurement and the shape argument. This one still runs for
 * DISCHARGE_BURN_TIME, so a proc is 6% of every body it caught.
 */
export const DISCHARGE_BURN_SHARE = 0.02;

/**
 * HP that must be absorbed before the capacitor fires. **Flat**, not per stack.
 *
 * It used to be `26 x stacks`, which made the perk's damage-per-second exactly
 * constant: the blast scaled with stacks and so did the wait, and the two
 * cancelled. Eight picks bought a lumpier version of one pick. Then the
 * internal cooldown below arrived and made it worse — with firing rate capped,
 * a bigger threshold could only ever be a downgrade.
 *
 * Flat threshold + a hard rate cap gives the perk one readable promise: **a
 * stack is a bigger event, never a more frequent one.**
 */
export const DISCHARGE_CHARGE_COST = 26;
/** Blast radius, and its damage as a multiple of the stack count */
export const DISCHARGE_RADIUS = 190;
/**
 * Raised 34 -> 70 because the stack cap fell from eight to three. Eight stacks
 * used to reach 272; three now reach 210, and the missing 62 is paid for by
 * the stun and the burn that the old version never had.
 */
export const DISCHARGE_DAMAGE = 70;
export const DISCHARGE_KNOCKBACK = 420;
/** Extra blast radius per stack past the first, so the growth is visible */
export const DISCHARGE_RADIUS_PER_STACK = 0.12;

/**
 * Internal cooldown, in seconds — the capacitor cannot fire again inside this
 * window however fast it refills.
 *
 * The charge threshold alone was not a rate limit. Standing inside a late-game
 * crowd absorbs damage far faster than 26 HP/s per stack, so the perk fired
 * every few frames and the knockback became a permanent field pushing the whole
 * arena away. That is the failure mode every proc in an ARPG eventually finds,
 * and the standard fix is the one used here: charge keeps accumulating during
 * the window (nothing you absorbed is wasted), it simply cannot *discharge*
 * until the window is up.
 */
export const DISCHARGE_COOLDOWN = 3.5;

/**
 * Ceiling on stored charge, as a multiple of the firing threshold.
 *
 * Without it the capacitor banks the whole cooldown window and then fires
 * several times back-to-back the moment it opens — the same burst, just
 * delayed.
 */
export const DISCHARGE_CHARGE_CAP = 1.5;

/**
 * Kill Echo's blast, as a fraction of **the CURRENT HP of each enemy it hits**.
 *
 * Three designs, and the reasoning for landing here:
 *
 *   1. `0.55 x the corpse's max HP` — a fat body was a bomb. Kill one late
 *      elite inside a pack and it deleted the pack, then every one of those
 *      deaths rolled its own echo. A screen wipe.
 *   2. `0.18 x the victim's max HP` — fixes the fat-corpse spike, but leaves a
 *      hole the user spotted: bosses walk surrounded by trash, and each piece
 *      of trash you kill takes a flat 18% off the *boss's* enormous maximum.
 *      You melt a boss by farming its escort.
 *   3. Current HP, which is what this is. The same mechanic as Blade of the
 *      Ruined King in League — percent of *current* health, so it hits like a
 *      truck on something untouched and fades to nothing on something nearly
 *      dead. (The item's number moved around a lot across patches, somewhere
 *      in the 8–12% range; I would not trust a specific patch value from me.)
 *
 * Why it is the right tool: the damage **shrinks as the target weakens**, which
 * is precisely backwards from what a cascade needs. Combined with the rule
 * below that an echo can never land a killing blow, the perk physically cannot
 * chain — it softens, and your weapons finish. That also makes it a companion
 * to a build rather than a replacement for one.
 *
 * **Raised 0.3 -> 0.5 alongside a cut from six stacks to three.** Play report:
 * it proc'd often enough to be background and hit softly enough that nothing
 * about it registered. Six stacks bought 36% of kills; the internal cooldown
 * below meant that in a late-game run the *chance* was not even the binding
 * constraint, so most of those stacks were buying nothing you could feel.
 *
 * Three stacks at 10% each, a longer cooldown and half the target's health per
 * blast is the same perk with its budget moved from frequency to size. Which
 * is the direction KILL_ECHO_ICD already argued for and did not go far enough
 * on: rare and loud beats constant and ignorable.
 */
export const KILL_ECHO_DAMAGE_SHARE = 0.5;
/**
 * Bosses take a quarter, the same courtesy every stun source gives them. A
 * percent-of-current-health effect is at its strongest against exactly the kind
 * of health pool a boss has.
 */
export const KILL_ECHO_BOSS_RESIST = 0.25;
/**
 * Back up to 84, having been tightened to 62 for a reason that no longer
 * holds.
 *
 * The tightening was about frequency, not size: enemies travel packed, so a
 * generous radius on an effect firing about once a second was "everything on
 * top of the corpse, every time". At one blast per KILL_ECHO_ICD it is an
 * event, and an event is allowed to be big — a blast you can see the edges of
 * is most of what makes it readable.
 */
export const KILL_ECHO_RADIUS = 84;
/**
 * Burn left on survivors, as a share of their own max HP per second.
 *
 * **Cut 0.09 -> 0.03** once the run summary started naming who dealt what. A
 * measured 17-minute clear: five weapons held 11% of the damage and 17% of the
 * killing blows between them, and this burn plus Static Discharge's had the
 * rest.
 *
 * The arithmetic behind that is not a tuning miss, it is a shape mismatch. A
 * late Void Nexus body carries ~57,000 HP, so 9% a second for 2.5 seconds is
 * ~12,800 damage — against a maxed weapon hit of a few hundred. **A percentage
 * does not care how big the enemy got; a weapon's number does.** Enemy health
 * multiplies by 2 per tier and again with the clock, while a weapon grows about
 * x15 across a whole run, so any percent-of-max-HP effect eventually becomes
 * the only thing in the build that is still killing anything.
 *
 * 3% for 2.5s is 7.5% of a body per proc, which is a real dent in a pack and
 * not a replacement for the weapons that are supposed to finish it.
 */
export const KILL_ECHO_BURN_SHARE = 0.03;

/**
 * Minimum seconds between echoes, however fast you are killing.
 *
 * **A per-kill chance has no rate.** It has a rate multiplied by your kill
 * speed, and kill speed swings by 3x between a slow Void Nexus run and a fast
 * Asteroid Fields one. Measured off two real runs at the same three stacks:
 *
 *     18% at  5.8 kills/s  ->  1.0 echoes per second
 *     18% at 15.7 kills/s  ->  2.8 echoes per second
 *
 * The play report was that three stacks on the easy stage sounded as constant
 * as six stacks on the hard one, which is exactly what those numbers say. An
 * effect firing three times a second is not an event, it is ambience, and the
 * perk stops being worth choosing because it stops being noticed.
 *
 * This is the same fix `DISCHARGE_COOLDOWN` already applies to Static
 * Discharge one file over, for the same reason: charge alone was not a rate
 * limit either. An internal cooldown is a WoW trinket ICD — it bounds the top
 * without touching how the effect feels when it does land.
 *
 * With the rate bounded, the blast is free to be twice as heavy. Rare and loud
 * beats constant and ignorable.
 *
 * **Lengthened 1.6 -> 2.6** when the perk's budget moved from frequency to
 * size. At three stacks and 2.6 seconds the ceiling is roughly one blast every
 * three seconds however fast you are killing, which is slow enough that you
 * look up when it happens.
 */
export const KILL_ECHO_ICD = 2.6;

/**
 * How hard the blast throws the bodies it catches, at the epicentre.
 *
 * The echo was **inaudible and untouchable** before this: it drew particles and
 * a thin ring and did nothing else, so the only evidence it had fired was
 * health bars moving somewhere in the pile. A perk you buy for "things explode
 * when they die" has to be felt, and the most direct way to feel an explosion
 * is to watch it move things.
 *
 * Bigger than the 190 of a contact shove on purpose — a shove is a body leaning
 * on you, this is a detonation. It falls off to nothing at the blast's edge, so
 * the shape of the shockwave is legible in how far each body flew.
 *
 * It is also the one part of the echo with no balance risk attached: knockback
 * deals no damage, cannot kill, and therefore cannot feed the cascade the
 * non-lethal rule exists to prevent.
 */
export const KILL_ECHO_KNOCKBACK = 460;

/**
 * Attribution tags for damage that comes from a perk rather than a weapon.
 *
 * `DamageSystem.weaponIdOf` reads `weaponId` off whatever dealt the hit, and
 * everything a perk deals used to pass `source: null` — so it landed in the run
 * summary's "perks and hazards" line, which is one bucket with no names in it.
 *
 * That bucket was hiding the answer to the question the summary exists to
 * answer. A measured 17-minute clear read as beautifully balanced across five
 * weapons — 45%/26%/15%/9%/5% of kills — until you noticed the weapons had
 * **11% of the damage and 17% of the kills between them**, and the other
 * 83% was two perks nobody could see.
 *
 * These carry no `owner`, so `DamageSystem.getPlayer` still finds nothing and
 * no modifier can leak in through the tag. They exist purely to be counted.
 */
export const KILL_ECHO_SOURCE = { weaponId: 'kill_echo' };
export const DISCHARGE_SOURCE = { weaponId: 'static_discharge' };
/** The arena itself — meteors, a rift collapsing */
export const HAZARD_SOURCE = { weaponId: 'arena' };

/**
 * What one echo takes off a body caught in the blast.
 *
 * Three rules, and each one exists because of a way this perk broke:
 *
 *   - **A share of the target's CURRENT health** — the damage shrinks as the
 *     target weakens, which is backwards from what a cascade needs. See
 *     KILL_ECHO_DAMAGE_SHARE for the two designs before this one.
 *   - **Never more than the corpse was worth.** The share alone still let a
 *     pack of trash melt a boss, because a percentage of a health pool built to
 *     be enormous is enormous. The blast's fuel is the body that produced it,
 *     so that body is also its ceiling — one rule that covers bosses,
 *     minibosses and elites instead of naming them one at a time.
 *   - **Never lethal.** No echo makes a corpse, so no echo makes another echo.
 *     A cascade is impossible by construction rather than unlikely by tuning.
 *
 * Lives here rather than inline in GameManager so the rule and its numbers sit
 * together — and so a test can call the thing the game calls, instead of
 * re-typing the formula and agreeing with itself.
 */
export function killEchoDamage(corpseMaxHp: number, targetHp: number, targetIsBoss: boolean): number {
    const share = targetIsBoss ? KILL_ECHO_DAMAGE_SHARE * KILL_ECHO_BOSS_RESIST : KILL_ECHO_DAMAGE_SHARE;
    return Math.min(targetHp * share, corpseMaxHp * share, Math.max(0, targetHp - 1));
}

/**
 * The burn left on survivors, in HP per second.
 *
 * Same ceiling as the blast, for the same reason — and this is where the boss
 * problem actually lived. `KILL_ECHO_BOSS_RESIST` only ever guarded the direct
 * hit, so the burn was taking a flat 9% of a boss's maximum every second while
 * the player farmed the trash standing around it. It is applied as a `flat`
 * infection (see core/StatusEffects), so it also never picks up might or crit.
 */
export function killEchoBurnDps(corpseMaxHp: number, targetMaxHp: number): number {
    return Math.min(targetMaxHp, corpseMaxHp) * KILL_ECHO_BURN_SHARE;
}

/**
 * Minimum seconds between the echo's camera kick.
 *
 * Late game kills arrive several a second and the perk caps at six stacks, so
 * an un-gated hit-stop would turn a good clear into a stutter. The sound has
 * its own limiter inside AudioSystem (`explosion`, 0.1s); this one is for the
 * part that touches time. The knockback and particles are deliberately NOT
 * gated — those scale with what actually happened.
 */
export const KILL_ECHO_PUNCH_GAP = 0.18;

/**
 * ## Second Wind — one death per run, and it costs you the pile
 *
 * A single pick, no stacks. The play report asked for perks that are *moments*
 * rather than multipliers ("it was nice when it went off"), and a perk you can
 * only ever own one of is the purest form of that: it fires once, you remember
 * where it happened.
 *
 * Guardian Angel from League, with the arena's own problem attached — coming
 * back at full health inside the crowd that just killed you is not a rescue, it
 * is a two-frame delay. So the save **clears the ground**: everything nearby is
 * thrown out and stunned, and `contactRampTime` resets, because the ramp is a
 * measure of how long you chose to stand there and you did not choose this.
 *
 * It deals no damage at all, which is deliberate — the run summary just showed
 * what happens when perks start doing the killing.
 */
export const SECOND_WIND_HP_SHARE = 0.35;
export const SECOND_WIND_RADIUS = 300;
export const SECOND_WIND_STUN = 1.8;
export const SECOND_WIND_KNOCKBACK = 700;

/**
 * ## Stasis — the arena stops, you do not
 *
 * Every TIME_STOP_INTERVAL seconds everything on screen freezes. No damage, no
 * knockback: it hands you *time*, which is the resource a survivors game is
 * actually about and the only one no other perk in the pool gives.
 *
 * Stacks buy **length, never frequency** — the rule DISCHARGE_CHARGE_COST
 * argues for one file over. A rarer, longer stop stays an event you look up at;
 * a more frequent one becomes weather.
 *
 * It rides `status.stun`, so it inherits the recovery rule from StatusEffects
 * for free: a frozen enemy is immune for twice the freeze afterwards, which is
 * what stops this from combining with Mind Blast or Absolute Zero into a
 * permanently parked arena.
 */
export const TIME_STOP_INTERVAL = 24;
/** How far the stasis reaches — comfortably past the edge of the screen */
export const TIME_STOP_RADIUS = 900;
export const TIME_STOP_BASE = 0.5;

/** Seconds the arena stands still, for a player holding `stacks` of the perk */
export function timeStopDuration(stacks: number): number {
    return stacks > 0 ? TIME_STOP_BASE + stacks : 0;
}

/**
 * ## Salvo — every weapon you own fires at once
 *
 * The perk that answers a measured problem directly. In a 17-minute clear the
 * five weapons held **11% of the damage between them** and two perks had the
 * rest; a build's weapon picks had stopped mattering. Every other tactic in
 * this file adds a new source of damage, which is precisely the wrong medicine.
 *
 * This one adds none. It reaches into the weapons already in the build and
 * fires them, so the damage lands on their own numbers, is credited to them in
 * the summary, and gets better the better your weapons are.
 *
 * Weapons that hold fire for their own reasons keep holding — Frost Nova with a
 * field still on the ground, Spore Cloud at its mat cap. A volley cannot
 * override a rule; it only skips the wait.
 */
export const SALVO_INTERVAL = 14;
/** Gap between volleys when the perk is stacked, so they read as a burst */
export const SALVO_SPACING = 0.35;

/** How long a repair cell stays on the ground */
export const REPAIR_LIFETIME = 12;

/**
 * A repair cell restores a share of the health you are **missing**, not a flat
 * amount.
 *
 * Measured: a 17-minute clear healed 2,603 against 2,652 taken — healing
 * refunded **98%** of everything the run did to the player, and the stage the
 * user remembered as the hard one "put up no resistance at all".
 *
 * The flat version could not have done anything else. Drops scale with kills
 * (`siphon` is a per-kill chance), kills scale with how strong the build is, so
 * the healing supply grew with exactly the thing it was supposed to be a
 * counterweight to: 10,023 kills dropped roughly 1,250 cells, and walking over
 * them at nearly full health still banked 6 HP a time. Chip damage was free.
 *
 * A share of what is missing breaks that link, because it does not care how
 * many kills produced the cell — only how much trouble you are in:
 *
 *     at 20% of a 255 HP pool -> 24 HP     (a real recovery)
 *     at 50%                  -> 15 HP
 *     at 90%                  -> 3 HP      (topping off is not worth a detour)
 *
 * So a cell is worth diving for when you are hurt, which is the decision the
 * player said they liked, and worth nothing when you are fine — which is when
 * they were quietly cancelling the whole run's damage.
 */
export const REPAIR_MISSING_SHARE = 0.12;
/** Floor, so a cell picked up at full health is not literally nothing */
export const REPAIR_MIN_HEAL = 2;

/** What one repair cell is worth to a player at `hp` of `maxHp` */
export function repairHeal(hp: number, maxHp: number): number {
    const missing = Math.max(0, maxHp - hp);
    return Math.max(REPAIR_MIN_HEAL, missing * REPAIR_MISSING_SHARE);
}

/**
 * Seconds without taking damage before regeneration starts again.
 *
 * This is what makes the whole regen model safe. `regen` is now a fraction of
 * **missing** health per second, which is the right shape — it is worth most
 * exactly when you are hurt, and nothing at all when you are full — but it has
 * an obvious failure mode: give it a generous number and standing next to a
 * single chaser becomes free again, which is precisely what the bite rework
 * just removed.
 *
 * Gating on being out of combat makes that **structurally impossible** rather
 * than numerically unlikely — the same move as "an echo can never land a
 * killing blow". Regeneration cannot out-heal a fight it is not allowed to run
 * during.
 *
 * It also gives the two healing sources genuinely different jobs: **repair
 * cells work during a fight** (you break out, you go and get one, they are
 * flat and they top you off), **regen works between fights** (automatic,
 * fastest when you are worst hurt, and by its exponential nature never quite
 * finishes).
 *
 * **Down from 3 seconds, then from 1.5.** Three was long enough to be a
 * permanent lockout rather than a gate: measured over a real run, bites landed
 * every ~3.5s against a 3s delay, so regeneration ran about a fifth of the time
 * and four picks of Nano-Repair delivered 0.63 HP/s — a card that read as
 * generous and paid out as nothing.
 *
 * One second is short enough that stepping out of a fight pays immediately,
 * which is what makes disengaging a decision rather than a formality, and still
 * long enough that nothing regenerates while a crowd is on it. The rate is
 * bounded by the stack cap on Nano-Repair, not by this — see its entry in
 * GameData for why the cap is what does the balancing.
 */
export const REGEN_COMBAT_DELAY = 1;

/**
 * Seconds clear of all damage before the Kinetic Deflector starts refilling,
 * and how long a full refill then takes.
 *
 * Longer than `REGEN_COMBAT_DELAY` on purpose. Regeneration is a trickle
 * proportional to what you are missing, so letting it start after a single
 * quiet second costs little. The shield is a lump sum, and a lump sum that
 * comes back the instant you step out of a pile turns "dive, spend it, leave"
 * into "hover at the edge of the pile forever" — the same in-and-out jitter
 * `CONTACT_RAMP_DECAY` was shaped to discourage.
 *
 * Three seconds means one dive per engagement, not one per second. The refill
 * itself is fast once it starts: the interesting decision is *whether you have
 * it*, not watching a bar creep.
 */
export const SHIELD_RECHARGE_DELAY = 3;
export const SHIELD_REFILL_TIME = 1.5;

/**
 * Absorbed damage needed before the capacitor fires.
 *
 * Independent of stack count — see DISCHARGE_CHARGE_COST. Zero stacks is
 * unreachable, which is what stops the perk firing before it is picked.
 */
export function dischargeThreshold(stacks: number): number {
    return stacks > 0 ? DISCHARGE_CHARGE_COST : Infinity;
}

/** Blast radius at this stack count */
export function dischargeRadius(stacks: number): number {
    return DISCHARGE_RADIUS * (1 + Math.max(0, stacks - 1) * DISCHARGE_RADIUS_PER_STACK);
}
