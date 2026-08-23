import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { CrystalField, type CrystalAttractor } from './entities/CrystalField';
import { DamageNumbers } from './core/DamageNumbers';
import { Entity } from '../engine/Entity';
import { CLASSES, ENEMIES, WEAPONS } from './data/GameData';
import { checkCollision, type Vector2, distance, formatTime } from '../engine/Utils';
import { levelSpatialHash } from '../engine/SpatialHash';
import { particles } from '../engine/ParticleSystem';
import { stateMachine, type GameState } from './core/StateMachine';
import { damageSystem, weaponIdOf } from './core/DamageSystem';
import { debugOverlay } from '../engine/DebugOverlay';
import { collisionSystem } from './core/CollisionSystem';
import { difficultyDirector } from './core/DifficultyDirector';
import { sprites } from './core/SpriteFactory';
import { stageBackdrop } from './core/StageBackdrop';
import { propField } from './core/PropField';
import { arenaEvents, type ArenaContext } from './core/ArenaEvents';
import { status } from './core/StatusEffects';
import { STAGES, type StageConfig } from './data/StageData';
import { audio } from '../engine/AudioSystem';
import { juice } from '../engine/JuiceSystem';
import { getPowerupValue, POWERUP_STACK_CAP } from './core/UpgradePool';
import { addStat } from './core/PlayerStats';
import { contactDamagePerSecond, contactRamp, CONTACT_REACH } from './core/ContactDamage';
import { computeScore, submitScore } from './core/Score';
import { RunStatsTracker } from './core/RunStats';
import { achievements, type RunSnapshot } from './core/Achievements';
import { RepairCell } from './entities/RepairCell';
import {
    dischargeThreshold, dischargeRadius, DISCHARGE_DAMAGE, DISCHARGE_KNOCKBACK,
    DISCHARGE_COOLDOWN, DISCHARGE_CHARGE_CAP,
    DISCHARGE_STUN_AT, DISCHARGE_BURN_AT, DISCHARGE_STUN,
    DISCHARGE_BURN_SHARE, DISCHARGE_BURN_TIME, repairHeal,
    SECOND_WIND_HP_SHARE, SECOND_WIND_RADIUS, SECOND_WIND_STUN, SECOND_WIND_KNOCKBACK,
    TIME_STOP_INTERVAL, TIME_STOP_RADIUS, timeStopDuration,
    SALVO_INTERVAL, SALVO_SPACING,
    KILL_ECHO_RADIUS, killEchoDamage, killEchoBurnDps,
    KILL_ECHO_SOURCE, DISCHARGE_SOURCE,
    KILL_ECHO_KNOCKBACK, KILL_ECHO_PUNCH_GAP, KILL_ECHO_ICD,
} from './core/Tactics';
import {
    BOSS_ESCORT_RADIUS, BOSS_PLATE_KILLS, BOSS_VULNERABLE_TIME, BOSS_PLATE_TIMEOUT,
} from './core/BossArmor';
import { screenManager } from '../engine/ui/ScreenManager';
import { LevelUpOverlay } from './ui/screens/LevelUpOverlay';
import { showRunSummary } from './ui/screens/RunSummaryOverlay';
import { PauseOverlay } from './ui/screens/PauseOverlay';

import { t } from './core/I18n';
import { stageName } from './core/Labels';

/**
 * Minimum seconds between hurt cues. The drain is continuous, so without this
 * the cue would fire every frame; the sprite flash already marks contact
 * frame by frame, and this gives the ear a beat rather than a buzz.
 */
const CONTACT_SOUND_MIN_GAP = 0.75;

/**
 * Seconds between printed contact-damage numbers.
 *
 * Slightly under the hurt cue, so the digits lead the sound rather than
 * doubling it, and well under DamageNumbers' TAKEN_MERGE_WINDOW so consecutive
 * prints fold into one growing number instead of stacking a column of digits
 * over the player's head.
 */
const CONTACT_NUMBER_INTERVAL = 0.4;

/** Seconds between printed healing numbers, when it is a trickle */
const HEAL_NUMBER_INTERVAL = 0.5;
/**
 * A single heal at least this big prints immediately instead of waiting.
 * Sized under the smallest useful repair cell so a pickup jumps the queue, and
 * well above any one frame of regen so a trickle never does.
 */
const HEAL_INSTANT_EVENT = 3;
/** Pixels above the damage-taken number, so the two never overlap */
const HEAL_NUMBER_LIFT = 16;

/**
 * Seconds over which a stage's `hpScale` fades in from 1.
 *
 * **The XP a kill is worth fades in on the same curve**, and that pairing is
 * not optional. `xpValue` is a pure function of enemy tier and never looked at
 * health, while the stage pools start at different tiers — Void Nexus opens at
 * tier 3, worth 3x an Asteroid Fields tier 0. Today that is a fair trade: the
 * Nexus enemy pays triple because it is nearly twice as tough.
 *
 * Softening its health without softening its payout would keep one half of
 * that trade and delete the other, and the first minute of the HARDEST stage
 * would become the fastest way in the game to level — roughly 360 XP against
 * 120, or level 10 by the first minute instead of level 5. Picking the
 * dangerous arena would be the greedy choice, which is backwards.
 *
 * Note this is NOT "XP scales with health" in general. That version has a
 * feedback loop in it: `DifficultyDirector.effectiveTime` already raises enemy
 * health from the player's *level*, so paying XP by health would mean level →
 * health → XP → level. This ramp is a pure function of the clock, so it cannot
 * feed back into itself.
 */
const STAGE_SCALE_RAMP = 60;

/** Knockback on contact: the player barely moves, the enemy is shoved aside */
const PLAYER_SHOVE_BACK = 55;
const ENEMY_SHOVE = 190;

export class GameManager {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    // Game state is now managed by stateMachine singleton
    get state(): GameState {
        return stateMachine.state;
    }
    set state(value: GameState) {
        stateMachine.transition(value);
    }

    player: Player | null = null;
    enemies: Enemy[] = [];
    /**
     * Everything the weapons spawn into the world: projectiles, zones, and the
     * purely visual entities that are neither. One list, because the previous
     * split by class silently dropped anything that matched no branch — see
     * Entity.DrawLayer.
     */
    entities: Entity[] = [];
    /** Every XP crystal on the floor, with its own culling and merge rules */
    crystals: CrystalField = new CrystalField();
    /** The digits that pop off a hit, and the hit feedback that goes with them */
    damageNumbers: DamageNumbers = new DamageNumbers();

    camera: Vector2 = { x: 0, y: 0 };

    backgroundTheme: string = 'Asteroid Fields';

    waveTimer: number = 0;
    gameTime: number = 0;

    uiLayer: HTMLElement;

    // Track weapon levels: weaponId -> level
    weaponLevels: Map<string, number> = new Map();
    // Track powerup stacks: powerup name -> times taken
    powerupLevels: Map<string, number> = new Map();

    devMode: boolean = false;
    killCount: number = 0;
    /** Tier-weighted kill total (sum of xpValue) — the score's kill term */
    killScore: number = 0;
    /** Which class this run was started with, recorded on the leaderboard */
    classId: string = CLASSES[0].id;
    /** Best crit, longest untouched streak, biggest multikill (see core/RunStats) */
    runStats: RunStatsTracker = new RunStatsTracker();

    currentStage: StageConfig = STAGES[0];
    private finalBoss: Enemy | null = null;
    private finalBossSpawned: boolean = false;
    /** Cooldown before the next hurt cue may play */
    private contactFxTimer: number = 0;
    /** Absorbed damage banked toward the next Static Discharge */
    private capacitorCharge: number = 0;
    /** Internal cooldown left on Static Discharge (see DISCHARGE_COOLDOWN) */
    private dischargeCooldown: number = 0;
    /** Gate on the Kill Echo camera kick (see KILL_ECHO_PUNCH_GAP) */
    private echoPunchTimer: number = 0;
    /** Internal cooldown on Kill Echo itself (see KILL_ECHO_ICD) */
    private echoIcdTimer: number = 0;
    /** Seconds until the next stasis, and until the next salvo */
    private timeStopTimer: number = TIME_STOP_INTERVAL;
    private salvoTimer: number = SALVO_INTERVAL;
    /** Volleys still owed by the current salvo, and the gap before the next */
    private salvoPending: number = 0;
    private salvoPulseTimer: number = 0;
    /** Second Wind is once per run — see SECOND_WIND_HP_SHARE */
    private secondWindUsed: boolean = false;
    /**
     * Contact damage banked since the last time a number was printed.
     *
     * The drain is continuous, so it cannot spawn a damage number per frame —
     * that is both unreadable and the reason design 2 felt like nothing was
     * happening. It accumulates and flushes on a fixed cadence, so a crowd
     * chewing on you reads as a steady beat of real numbers.
     */
    private contactPending: number = 0;
    private contactPrintTimer: number = 0;
    /**
     * Healing banked since the last green number, and the largest single event
     * in it. Regen arrives as a fraction of a point every frame, so it has to
     * gather the same way contact damage does — but a repair cell is a thing
     * you walked over and got, and waiting even half a second to say so breaks
     * the one moment healing exists for.
     */
    private healPending: number = 0;
    private healBiggestEvent: number = 0;
    private healPrintTimer: number = 0;
    repairCells: RepairCell[] = [];

    /**
     * The level-up card panel. It takes `this` as its host rather than a copy of
     * the run state, because `player` is replaced on every new run.
     */
    private levelUp = new LevelUpOverlay(this);
    private pause: PauseOverlay;


    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.uiLayer = document.getElementById('ui-layer')!;
        this.pause = new PauseOverlay(this.uiLayer);

        // Connect DamageSystem to damage number display
        damageSystem.setDamageNumberCallback((pos, amount, isCrit, source) => {
            this.damageNumbers.spawn(pos, amount, isCrit);
            this.runStats.recordHit(amount, isCrit, weaponIdOf(source));
        });

        // Note: class selection is owned by ui/screens/ClassSelectionScreen
    }

    startGame(classIndex: number, stageIndex: number = 0) {
        this.currentStage = STAGES[stageIndex] ?? STAGES[0];
        this.backgroundTheme = this.currentStage.theme;
        stageBackdrop.setStage(this.currentStage);
        propField.setStage(this.currentStage);
        propField.reset();
        arenaEvents.reset();
        stageBackdrop.blackout = 0;
        // Also drops the i18n subscription — the old inline version removed the
        // node but left the listener attached
        this.pause.close();
        this.levelUp.detach();
        this.finalBoss = null;
        this.finalBossSpawned = false;
        // Nothing from the last run may survive into this one, least of all in
        // the structure every weapon uses to find targets
        levelSpatialHash.clear();
        // Reset progression tracking BEFORE adding the starting weapon
        this.powerupLevels.clear();
        this.weaponLevels.clear();

        const cls = CLASSES[classIndex];
        this.classId = cls.id;
        this.player = new Player(0, 0);

        // Apply Class Stats
        this.player.classId = cls.id;
        this.player.className = cls.name;
        this.player.classEmoji = cls.emoji;
        this.player.perLevel = cls.perLevel;

        // Set HP from class
        this.player.hp = cls.hp;
        this.player.maxHp = cls.hp;

        Object.assign(this.player.stats, cls.stats);

        this.player.baseMaxHp = cls.hp;
        this.player.onLevelUp = () => this.levelUp.show();
        this.player.onHeal = amount => {
            this.runStats.recordHeal(amount);
            this.healPending += amount;
            this.healBiggestEvent = Math.max(this.healBiggestEvent, amount);
        };
        // The moment the buffer runs out is the moment the next hit starts
        // costing health, and that transition has to be audible — the bar band
        // emptying is not something you are looking at while a crowd is on you.
        // No camera shake: being surrounded is exactly when the screen has to
        // hold still enough to find the gap (see emitContactFeedback).
        this.player.onShieldBreak = () => {
            audio.play('hurt');
            juice.flash('#39d4ff', 0.22, 0.16);
        };

        // Add starting weapon
        this.addWeapon(cls.weaponId);

        this.enemies = [];
        this.entities = [];
        this.crystals.clear();
        this.repairCells = [];
        this.capacitorCharge = 0;
        this.dischargeCooldown = 0;
        this.echoPunchTimer = 0;
        this.echoIcdTimer = 0;
        this.timeStopTimer = TIME_STOP_INTERVAL;
        this.salvoTimer = SALVO_INTERVAL;
        this.salvoPending = 0;
        this.salvoPulseTimer = 0;
        this.secondWindUsed = false;
        this.contactPending = 0;
        this.contactPrintTimer = 0;
        this.healPending = 0;
        this.healBiggestEvent = 0;
        this.healPrintTimer = 0;
        this.damageNumbers.clear();
        this.killCount = 0;
        this.killScore = 0;
        this.runStats.reset();
        this.gameTime = 0;
        difficultyDirector.reset();
        this.camera.x = this.player.pos.x - this.canvas.width / 2;
        this.camera.y = this.player.pos.y - this.canvas.height / 2;
        juice.reset();
        particles.clear();
        audio.startMusic(this.currentStage.theme);
        this.state = 'PLAYING';

        // Enable debug overlay if in dev mode
        debugOverlay.enabled = this.devMode;
        // Note: HUD is now created by GameScreen
    }

    addWeapon(weaponId: string) {
        if (!this.player) return;

        const weaponData = WEAPONS.find(w => w.id === weaponId);
        if (!weaponData) return;

        // Check if weapon already exists
        const existingWeapon = this.player.weapons.find((w: any) => w.weaponId === weaponId);

        if (existingWeapon) {
            // Upgrade existing weapon
            const currentLevel = this.weaponLevels.get(weaponId) || 1;

            if (currentLevel === 5) {
                // Evolve weapon
                this.evolveWeapon(weaponId);
            } else {
                // Regular upgrade
                this.weaponLevels.set(weaponId, currentLevel + 1);
                existingWeapon.upgrade();
            }
        } else {
            // Add new weapon
            const weapon: any = new weaponData.class(this.player);
            weapon.weaponId = weaponId;
            weapon.onSpawn = (entity: Entity) => this.spawnEntity(entity);
            this.player.weapons.push(weapon);
            this.weaponLevels.set(weaponId, 1);
        }
    }

    evolveWeapon(weaponId: string) {
        if (!this.player) return;

        const weaponData = WEAPONS.find(w => w.id === weaponId);
        if (!weaponData) return;

        const existingWeapon: any = this.player.weapons.find((w: any) => w.weaponId === weaponId);
        if (!existingWeapon) return;

        // Mark as evolved (this is the primary check used by weapons)
        existingWeapon.evolved = true;
        existingWeapon.level = 6; // For compatibility with weaponLevels tracking
        existingWeapon.name = weaponData.evolution.name;
        existingWeapon.emoji = weaponData.evolution.emoji;

        // Boost damage (but NOT cooldown - new balance rule)
        existingWeapon.damage *= 2;
        existingWeapon.area *= 1.3;
        // NOTE: Removed baseCooldown *= 0.5 - evolved weapons handle their own CD

        this.weaponLevels.set(weaponId, 6);
        audio.play('evolve');

        // Evolutions are rare — sell them
        juice.flash('#ffdd44', 0.45, 0.6);
        juice.zoomPunch(0.55);
        if (this.player) {
            juice.shockwave(this.player.pos.x, this.player.pos.y, 320, '#ffdd44', 0.7, 8);
            particles.emitExplosion(this.player.pos.x, this.player.pos.y, 80, ['#ffdd44', '#ffffff', '#ff9900']);
        }
    }

    createHUD() {
        const hud = document.createElement('div');
        hud.className = 'hud';
        hud.style.display = 'block';
        hud.innerHTML = `
      <div class="hud-top">
        <div class="bar-container">
          <div class="hp-bar-fill" id="hp-bar"></div>
        </div>
        <div class="stats" id="timer">00:00</div>
        <div class="stats" id="kill-count">💀 0</div>
      </div>
      <div class="xp-bar-container">
        <div class="xp-bar-fill" id="xp-bar"></div>
      </div>
      <div class="stats" style="position:absolute; bottom: 10px; left: 10px;" id="level-display">LVL 1</div>
    `;
        this.uiLayer.appendChild(hud);
    }

    updateHUD() {
        if (!this.player) return;

        const hpBar = document.getElementById('hp-bar');
        if (hpBar) hpBar.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;

        const shieldBar = document.getElementById('shield-bar');
        if (shieldBar) {
            const pct = Math.min(100, (this.player.shield / this.player.maxHp) * 100);
            shieldBar.style.width = `${pct}%`;
        }

        const xpBar = document.getElementById('xp-bar');
        if (xpBar) xpBar.style.width = `${(this.player.xp / this.player.nextLevelXp) * 100}%`;

        const levelDisplay = document.getElementById('level-display');
        if (levelDisplay) levelDisplay.textContent = `LVL ${this.player.level}`;

        const timer = document.getElementById('timer');
        if (timer) {
            const minutes = Math.floor(this.gameTime / 60).toString().padStart(2, '0');
            const seconds = Math.floor(this.gameTime % 60).toString().padStart(2, '0');
            timer.textContent = `${minutes}:${seconds}`;
        }
    }

    /** Anything a weapon spawns lands here — no class test, nothing to fall through */
    spawnEntity(entity: Entity) {
        this.entities.push(entity);
        audio.play('shoot');
    }

    /**
     * Escape / pause button. Only PLAYING ↔ PAUSED — a level-up or the game
     * over panel is already a modal state and must not be interruptible.
     */
    togglePause() {
        if (this.state === 'PLAYING') this.pauseGame();
        else if (this.state === 'PAUSED') this.resumeGame();
    }

    private pauseGame() {
        this.state = 'PAUSED';
        audio.pauseMusic();
        this.pause.open(
            () => ({
                stage: stageName(this.currentStage),
                time: formatTime(this.gameTime),
                kills: this.killCount,
            }),
            {
                onResume: () => this.resumeGame(),
                onQuit: () => {
                    this.resumeGame();
                    audio.stopMusic();
                    this.state = 'MENU';
                    screenManager.goto('main_menu');
                },
            },
        );
    }

    private resumeGame() {
        this.pause.close();
        if (this.state === 'PAUSED') this.state = 'PLAYING';
        audio.resumeMusic();
    }

    /**
     * Hurt feedback for a bite.
     *
     * **Still no camera shake.** A bite is an event now, and events normally
     * earn shake — but not this one: being surrounded is exactly when the
     * player most needs to read where the gap is, and an earlier version that
     * shook on contact made the arena unreadable at the worst possible moment.
     *
     * The sound is rate-limited rather than played per bite, because a full
     * ring of six chews through the pack faster than a "tk-tk-tk-tk" machine
     * gun is bearable. Everything else carries it: the HP bar step, the player
     * sprite flashing red, and a vignette that deepens as health drops.
     */
    private emitContactFeedback(damage: number) {
        if (!this.player || damage <= 0) return;

        if (this.contactFxTimer > 0) return;
        this.contactFxTimer = CONTACT_SOUND_MIN_GAP;

        audio.play('hurt');
        // Edge-only, and it deepens as HP drops — readable without hiding the
        // middle of the screen where the enemies are
        juice.pulseVignette(0.3 + (1 - this.player.hp / this.player.maxHp) * 0.5);
    }

    /**
     * Drain health for every enemy currently pressed against the player.
     *
     * **No caps, no budgets, no per-enemy clocks.** Every one of those existed
     * to tame a contact number that had grown by a factor of 33 across a run;
     * with that fixed at the source (see core/ContactDamage and
     * ENEMY_CONFIG.baseDamage) the honest sum is safe, and geometry bounds it —
     * only 6-9 bodies physically fit against the player, and `touching` is
     * built from real overlap rather than from a constant.
     *
     * What makes a crowd lethal is the ramp: the drain grows the longer you
     * stand in it and sheds when you leave, so running through is nearly free
     * and camping kills. That single rule replaced the three limiters that came
     * before it, and it is the one the player can actually see themselves
     * losing to.
     */
    private resolveContact(touching: Enemy[], dt: number) {
        if (!this.player) return;

        const player = this.player;
        player.updateContactRamp(touching.length > 0, dt);

        if (touching.length === 0) {
            this.flushContactNumber(dt);
            return;
        }

        this.runStats.recordPileUp(touching.length);
        // Being *in* contact is what breaks the untouched streak, not a
        // threshold of damage — standing in a crowd is never "untouched"
        this.runStats.onPlayerHurt();

        const ramp = contactRamp(player.contactRampTime);
        const perSecond = contactDamagePerSecond(
            touching.map(e => e.damage),
            player.stats.armor,
            ramp,
        );
        const drain = perSecond * dt;
        if (drain <= 0) return;

        // The capacitor is charged by what the crowd threw at you, shield or
        // no shield — Static Discharge is paid for by being surrounded, and
        // the deflector does not change that you were.
        this.chargeCapacitor(drain);

        // Everything else follows the *health bar*: a shielded frame costs no
        // HP, so it must not print a number, deepen the vignette or count as
        // damage taken. The seconds still count — you were in the pile.
        const lost = player.takeContact(drain);
        this.runStats.recordContact(lost, dt);
        if (lost > 0) {
            this.emitContactFeedback(lost);
            this.contactPending += lost;
        }
        this.flushContactNumber(dt);
    }

    /**
     * Print the banked contact damage on a fixed cadence.
     *
     * A per-frame number would be sub-1 digits flickering sixty times a second,
     * which is exactly the "the HP bar just slides and nothing tells you why"
     * failure of the continuous model the first time it was tried. Batching to
     * a beat gives the drain a *voice* without giving it false precision.
     */
    /**
     * Print banked healing as one green number over the player's head.
     *
     * Two clocks in one, because healing arrives in two completely different
     * shapes. Regen is a fraction of a point every frame and has to gather or
     * it is sub-1 noise flickering sixty times a second. A repair cell is six
     * points at once, in response to the player walking onto it, and the answer
     * has to arrive **now** — that pickup is the "oh thank god" moment the whole
     * healing model is built around, and a number that shows up half a second
     * late lands after the feeling it was meant to confirm.
     *
     * So a discrete event jumps the queue and everything else waits its turn.
     */
    private flushHealNumber(dt: number) {
        if (!this.player) return;

        this.healPrintTimer -= dt;
        const discrete = this.healBiggestEvent >= HEAL_INSTANT_EVENT;
        if (this.healPrintTimer > 0 && !discrete) return;

        this.healPrintTimer = HEAL_NUMBER_INTERVAL;
        this.healBiggestEvent = 0;
        if (this.healPending < 1) return;

        // Above the damage-taken number, so a frame that both hurts and heals
        // reads as two things rather than one number changing colour
        this.damageNumbers.spawnHealed(
            { x: this.player.pos.x, y: this.player.pos.y - this.player.radius - HEAL_NUMBER_LIFT },
            this.healPending,
        );
        this.healPending = 0;
    }

    private flushContactNumber(dt: number) {
        if (!this.player) return;

        this.contactPrintTimer -= dt;
        if (this.contactPrintTimer > 0) return;

        this.contactPrintTimer = CONTACT_NUMBER_INTERVAL;
        if (this.contactPending < 1) return;

        // Above the head, so it does not sit under the crowd standing on you
        this.damageNumbers.spawnTaken(
            { x: this.player.pos.x, y: this.player.pos.y - this.player.radius },
            this.contactPending,
        );
        this.contactPending = 0;
    }

    /**
     * Static Discharge: the capacitor is charged by the damage you absorb, so
     * the perk is strongest exactly when being surrounded is about to kill you.
     *
     * Gated by an internal cooldown as well as by the charge threshold. Charge
     * alone is not a rate limit — a late-game crowd feeds the capacitor far
     * faster than it costs, so the perk fired every few frames and its
     * knockback turned into a permanent field holding the arena at arm's
     * length. See DISCHARGE_COOLDOWN.
     */
    private chargeCapacitor(absorbed: number) {
        if (!this.player || this.player.stats.discharge <= 0) return;

        const threshold = dischargeThreshold(this.player.stats.discharge);
        // Charge banks during the cooldown — absorbed damage is never wasted —
        // but not without limit, or the window ends in a burst of discharges
        this.capacitorCharge = Math.min(
            this.capacitorCharge + absorbed,
            threshold * DISCHARGE_CHARGE_CAP,
        );

        if (this.dischargeCooldown > 0) return;
        if (this.capacitorCharge < threshold) return;

        this.capacitorCharge = 0;
        this.dischargeCooldown = DISCHARGE_COOLDOWN;
        const radius = dischargeRadius(this.player.stats.discharge) * this.player.stats.area;
        const damage = DISCHARGE_DAMAGE * this.player.stats.discharge;

        const stacks = this.player.stats.discharge;

        audio.play('explosion');
        juice.addTrauma(0.35);
        juice.shockwave(this.player.pos.x, this.player.pos.y, radius * 1.4, '#8ce8ff', 0.45, 6);
        particles.emitLightning(this.player.pos.x, this.player.pos.y);

        // Carries the owner so the blast still scales with the build, and the
        // perk's id so the run summary can name what dealt it — see
        // DISCHARGE_SOURCE. Built once rather than per enemy caught.
        const blastSource = { owner: this.player, weaponId: DISCHARGE_SOURCE.weaponId };

        for (const enemy of levelSpatialHash.getWithinRadius(this.player.pos, radius)) {
            if (distance(this.player.pos, enemy.pos) > radius) continue;
            damageSystem.dealDamage({
                baseDamage: damage,
                source: blastSource,
                target: enemy,
                position: enemy.pos,
            });
            const dx = enemy.pos.x - this.player.pos.x;
            const dy = enemy.pos.y - this.player.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            enemy.applyKnockback(dx / len, dy / len, DISCHARGE_KNOCKBACK);

            // Each stack past the first adds something the blast DOES rather
            // than making it bigger — see the tier comment in core/Tactics.
            // Both ride existing systems, so both inherit their safety rules:
            // stun carries the downtime ratio from StatusEffects, and the burn
            // resolves over seconds instead of inside this frame.
            if (stacks >= DISCHARGE_STUN_AT) {
                status.stun(enemy, DISCHARGE_STUN);
            }
            if (stacks >= DISCHARGE_BURN_AT) {
                status.infect(enemy, {
                    dps: enemy.maxHp * DISCHARGE_BURN_SHARE,
                    duration: DISCHARGE_BURN_TIME,
                    source: DISCHARGE_SOURCE,
                    kind: 'burn',
                    // A share of the target's own health — see InfectParams
                    flat: true,
                });
            }
        }
    }

    /**
     * A body that fell on a fungal mat feeds it, and the mat lives longer.
     *
     * Asks for the *capability* rather than testing the class, the way the rest
     * of the entity list works — `instanceof` in this file is what used to
     * decide whether a spawned thing existed at all, and it has no business
     * deciding this either. A zone that can eat says so by having the method.
     *
     * Every overlapping mat gets fed, which is deliberate: laying patches on
     * top of each other is the Astro Biologist's whole game, and a kill in the
     * overlap ought to pay all of them. Each mat's own budget is what stops it
     * running away.
     */
    private feedFungus(enemy: Enemy) {
        for (const entity of this.entities) {
            const mat = entity as unknown as { feedOnDeath?: (x: number, y: number) => boolean };
            if (typeof mat.feedOnDeath !== 'function') continue;
            if (mat.feedOnDeath(enemy.pos.x, enemy.pos.y)) {
                particles.emitPoison(enemy.pos.x, enemy.pos.y);
            }
        }
    }

    /**
     * The two tactics that run on a clock rather than on a trigger.
     *
     * Both are events, and both are deliberately *rare*: the play report that
     * asked for them praised Static Discharge for the moment it makes, and a
     * moment that happens every few seconds is weather. Neither deals damage of
     * its own — see the comments in core/Tactics for why that matters right
     * now.
     */
    private tickTimedTactics(dt: number) {
        if (!this.player) return;

        if (this.player.stats.timeStop > 0) {
            this.timeStopTimer -= dt;
            if (this.timeStopTimer <= 0) {
                this.timeStopTimer = TIME_STOP_INTERVAL;
                this.freezeArena(timeStopDuration(this.player.stats.timeStop));
            }
        }

        const volleys = this.player.stats.salvo;
        if (volleys > 0) {
            this.salvoTimer -= dt;
            if (this.salvoTimer <= 0) {
                this.salvoTimer = SALVO_INTERVAL;
                this.salvoPending = volleys;
                this.salvoPulseTimer = 0;
            }
        }

        if (this.salvoPending > 0) {
            this.salvoPulseTimer -= dt;
            if (this.salvoPulseTimer <= 0) {
                this.salvoPending--;
                this.salvoPulseTimer = SALVO_SPACING;
                this.fireSalvo();
            }
        }
    }

    /**
     * Stasis: everything on screen stops for a moment.
     *
     * Rides `status.stun`, which is the whole reason it is safe to hand out —
     * the recovery rule in StatusEffects means a frozen enemy is immune for
     * twice the freeze afterwards, so this cannot be stacked with Mind Blast or
     * Absolute Zero into an arena that never moves again.
     */
    private freezeArena(duration: number) {
        if (!this.player || duration <= 0) return;

        // 'evolve' rather than a hit sound: nothing is being struck, the arena
        // is changing state
        audio.play('evolve');
        juice.flash('#bfe9ff', 0.35, 0.22);
        juice.pulseVignette(0.5);
        juice.shockwave(this.player.pos.x, this.player.pos.y, TIME_STOP_RADIUS * 0.5, '#bfe9ff', 0.5, 8);

        for (const enemy of levelSpatialHash.getWithinRadius(this.player.pos, TIME_STOP_RADIUS)) {
            status.stun(enemy, duration);
        }
    }

    /**
     * Salvo: every weapon in the build fires now.
     *
     * Zeroing the cooldown rather than calling anything directly is the point.
     * A weapon holding fire for a reason of its own keeps holding — Frost Nova
     * with a field still on the ground, Spore Cloud at its mat cap — because
     * those rules live in the weapon's own update and this never reaches past
     * them. A volley skips the wait; it does not override a rule.
     */
    private fireSalvo() {
        if (!this.player || this.player.weapons.length === 0) return;

        audio.play('shoot');
        juice.zoomPunch(0.25);
        for (const weapon of this.player.weapons) {
            weapon.cooldown = 0;
        }
    }

    /**
     * Second Wind: the run does not end, once.
     *
     * Coming back at full health in the middle of the crowd that just killed
     * you is a two-frame delay, not a rescue — so the save is mostly about
     * *space*: everything nearby is thrown out and stunned, and the contact
     * ramp resets, because the ramp measures how long you chose to stand there
     * and this was not a choice.
     */
    private secondWind(): boolean {
        if (!this.player) return false;
        if (this.secondWindUsed || this.player.stats.secondWind <= 0) return false;

        this.secondWindUsed = true;
        this.player.isDead = false;
        this.player.hp = this.player.maxHp * SECOND_WIND_HP_SHARE;
        this.player.contactRampTime = 0;

        audio.play('levelup');
        juice.hitStop(0.16);
        juice.slowMo(0.35, 0.9);
        juice.flash('#ffd166', 0.5, 0.5);
        juice.addTrauma(0.8);
        juice.zoomPunch(0.9);
        juice.shockwave(this.player.pos.x, this.player.pos.y, SECOND_WIND_RADIUS, '#ffd166', 0.5, 10);
        particles.emitExplosion(this.player.pos.x, this.player.pos.y, SECOND_WIND_RADIUS * 0.6,
            ['#ffd166', '#ff6b35', '#ffffff']);

        for (const enemy of levelSpatialHash.getWithinRadius(this.player.pos, SECOND_WIND_RADIUS)) {
            const dx = enemy.pos.x - this.player.pos.x;
            const dy = enemy.pos.y - this.player.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            enemy.applyKnockback(dx / len, dy / len, SECOND_WIND_KNOCKBACK);
            status.stun(enemy, SECOND_WIND_STUN);
        }
        return true;
    }

    /**
     * An escort died near a boss, so a plate comes off.
     *
     * This is the bounded version of a pattern that had to be killed twice —
     * "melt the boss by farming its escort". The crowd deals the boss no damage
     * at all here; it buys a **window**, and what happens inside the window is
     * the player's own weapons at their own numbers. A window has a length, so
     * no kill rate converts into more than one per cycle. The whole argument is
     * in core/BossArmor.
     */
    private chipBossArmor(dead: Enemy) {
        if (dead.isBoss) return;

        for (const boss of this.enemies) {
            if (!boss.armored || boss.isDead) continue;
            if (boss.vulnerableFor > 0) continue;
            if (distance(dead.pos, boss.pos) > BOSS_ESCORT_RADIUS) continue;

            boss.armorKills++;
            if (boss.armorKills >= BOSS_PLATE_KILLS) this.exposeBoss(boss);
            else particles.emitHit(boss.pos.x, boss.pos.y, '#8ce8ff');
        }
    }

    /**
     * The armour comes off on a clock as well as on kills.
     *
     * Without this the rule can be refused: kite the boss away from the crowd,
     * clear the crowd elsewhere, and nothing ever opens — a boss taking 15% of
     * your damage forever is worse than the sponge it replaces. Fighting beside
     * it is still worth about four times the windows. See BOSS_PLATE_TIMEOUT.
     */
    private tickBossArmor(dt: number) {
        for (const boss of this.enemies) {
            if (!boss.armored || boss.isDead || boss.vulnerableFor > 0) continue;
            boss.armorTimer += dt;
            if (boss.armorTimer >= BOSS_PLATE_TIMEOUT) this.exposeBoss(boss);
        }
    }

    /** The plates blow off and the boss takes full damage for a few seconds */
    private exposeBoss(boss: Enemy) {
        boss.armorKills = 0;
        boss.armorTimer = 0;
        boss.vulnerableFor = BOSS_VULNERABLE_TIME;

        audio.play('evolve');
        juice.addTrauma(0.35);
        juice.shockwave(boss.pos.x, boss.pos.y, boss.radius * 4, '#8ce8ff', 0.4, 7);
        particles.emitExplosion(boss.pos.x, boss.pos.y, boss.radius * 2,
            ['#8ce8ff', '#ffffff', '#3a7fa0']);
    }

    /**
     * Kill Echo: a dead enemy sometimes takes its neighbours with it.
     *
     * Scaled off the corpse's max HP so it stays relevant as enemies get
     * tougher, and dealt with `skipModifiers` so the player's damage stats do
     * not multiply it.
     *
     * **An echo cannot kill, so an echo cannot chain.** The original comment
     * here claimed `skipModifiers` prevented chaining; it does not — it only
     * stops the damage being amplified. Anything the blast killed still went
     * through the death loop and rolled its own echo, one generation per frame,
     * with no limit, and on a hard stage that cleared the screen. The blast is
     * now non-lethal by construction (and `Enemy.echoed` stays as a second
     * lock), so the perk softens a pack and your weapons finish it.
     */
    private killEcho(enemy: Enemy) {
        if (!this.player) return;
        if (enemy.echoed) return;
        // Bounded rate first, chance second — see KILL_ECHO_ICD for why a
        // per-kill chance alone is not a rate at all
        if (this.echoIcdTimer > 0) return;
        if (Math.random() >= this.player.stats.killEcho) return;
        this.echoIcdTimer = KILL_ECHO_ICD;

        const radius = KILL_ECHO_RADIUS * this.player.stats.area;

        // Two rings rather than one: a fast white core and a slower amber
        // front behind it. A single expanding circle reads as "a circle
        // appeared"; two travelling at different speeds read as a blast front,
        // and this perk's whole problem was that it did not register.
        // Affordable now that the internal cooldown holds it near one blast
        // every three seconds — see KILL_ECHO_ICD.
        particles.emitExplosion(enemy.pos.x, enemy.pos.y, radius, ['#ffd166', '#ff6b35', '#ffffff']);
        juice.shockwave(enemy.pos.x, enemy.pos.y, radius * 1.2, '#ffffff', 0.16, 4);
        juice.shockwave(enemy.pos.x, enemy.pos.y, radius * 2.6, '#ffb03c', 0.42, 9);

        // The blast has to be heard and felt, not just seen. Before this the
        // echo drew particles and a thin ring and stopped there, so a perk sold
        // as "things explode when they die" registered as health bars quietly
        // dropping somewhere inside the pile.
        //
        // The sound is throttled inside AudioSystem; the camera kick needs its
        // own gate, because kills arrive several a second late game and an
        // ungated hit-stop would stutter every good clear. See
        // KILL_ECHO_PUNCH_GAP.
        audio.play('explosion');
        if (this.echoPunchTimer <= 0) {
            this.echoPunchTimer = KILL_ECHO_PUNCH_GAP;
            juice.hitStop(0.07);
            juice.addTrauma(0.3);
        }

        for (const other of levelSpatialHash.getWithinRadius(enemy.pos, radius)) {
            if (other === enemy || other.isDead) continue;
            const gap = distance(enemy.pos, other.pos);
            if (gap > radius) continue;

            // Thrown outward, hardest at the epicentre. This is the part that
            // makes the echo legible: you read the size and shape of the blast
            // off how far the bodies went, which no amount of particles does.
            const dx = other.pos.x - enemy.pos.x;
            const dy = other.pos.y - enemy.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            const falloff = 1 - gap / radius;
            other.applyKnockback(dx / len, dy / len, KILL_ECHO_KNOCKBACK * falloff);
            // A share of the target's current health, capped by what the
            // corpse was worth and never lethal — all three rules, and why
            // each one is there, live in killEchoDamage
            const damage = killEchoDamage(enemy.maxHp, other.hp, other.isBoss);

            if (damage > 0) {
                damageSystem.dealDamage({
                    baseDamage: damage,
                    source: KILL_ECHO_SOURCE,
                    target: other,
                    position: other.pos,
                    skipModifiers: true,
                });
            }

            // Survivors walk away on fire. The burn CAN finish them, and that
            // is fine: it resolves over seconds through StatusEffects, not
            // inside this frame, so it is a kill the perk earned rather than a
            // chain reaction.
            status.infect(other, {
                dps: killEchoBurnDps(enemy.maxHp, other.maxHp),
                duration: 2.5,
                source: KILL_ECHO_SOURCE,
                kind: 'burn',
                // Measured against the target, so it must not be measured
                // against the player's damage stats as well — see InfectParams
                flat: true,
            });
        }
    }

    addEvolvedWeapon(weaponId: string) {
        if (!this.player) return;

        const weaponData = WEAPONS.find(w => w.id === weaponId);
        if (!weaponData) return;

        // Check if weapon already exists
        const existingWeapon: any = this.player.weapons.find((w: any) => w.weaponId === weaponId);

        if (existingWeapon) {
            // Upgrade to evolved if not already
            if (existingWeapon.level < 6) {
                existingWeapon.level = 6;
                existingWeapon.evolved = true;
                existingWeapon.name = weaponData.evolution.name;
                existingWeapon.emoji = weaponData.evolution.emoji;
                existingWeapon.damage *= 2;
                existingWeapon.area *= 1.3;
                this.weaponLevels.set(weaponId, 6);
            }
        } else {
            // Add new weapon directly as evolved
            const weapon: any = new weaponData.class(this.player);
            weapon.weaponId = weaponId;
            weapon.level = 6;
            weapon.evolved = true;
            weapon.name = weaponData.evolution.name;
            weapon.emoji = weaponData.evolution.emoji;
            weapon.damage *= 2;
            weapon.area *= 1.3;
            weapon.onSpawn = (entity: Entity) => this.spawnEntity(entity);
            this.player.weapons.push(weapon);
            this.weaponLevels.set(weaponId, 6);
        }
    }

    applyPowerup(opt: any) {
        if (!this.player) return;

        // Stacking is flat by default and capped per powerup (see GameData)
        const stack = this.powerupLevels.get(opt.name) ?? 0;
        const value = getPowerupValue(opt.value, stack, opt.stackGrowth);
        const cap = opt.maxStacks ?? POWERUP_STACK_CAP;
        this.powerupLevels.set(opt.name, Math.min(cap, stack + 1));

        // Limits and overflow conversions all live in addStat, shared with the
        // class's per-level growth
        if (opt.type in this.player.stats) {
            addStat(this.player.stats as any, opt.type, value);
        }

        // Special handling for maxHp
        if (opt.type === 'maxHp') {
            this.player.maxHp += value;
            this.player.hp += value;
        }
    }

    update(dt: number) {
        // Update debug overlay (FPS tracking)
        debugOverlay.update(dt);

        if (this.state !== 'PLAYING') return;
        if (!this.player) return;

        // Update debug stats
        debugOverlay.setStats({
            enemies: this.enemies.length,
            particles: particles.getParticleCount(),
            projectiles: this.entities.length
        });

        this.gameTime += dt;
        this.runStats.update(dt);
        if (this.dischargeCooldown > 0) this.dischargeCooldown -= dt;
        if (this.echoPunchTimer > 0) this.echoPunchTimer -= dt;
        if (this.echoIcdTimer > 0) this.echoIcdTimer -= dt;
        if (this.contactFxTimer > 0) this.contactFxTimer -= dt;
        this.tickTimedTactics(dt);
        this.tickBossArmor(dt);
        this.flushHealNumber(dt);
        this.waveTimer += dt;

        // Parallax layers drift with the camera (frozen while paused)
        stageBackdrop.update(dt, this.camera, this.canvas.width, this.canvas.height);

        // Adaptive spawning — DifficultyDirector decides how many and how strong
        difficultyDirector.update(dt, {
            gameTime: this.gameTime,
            playerLevel: this.player.level,
            playerHpRatio: this.player.hp / this.player.maxHp,
            enemyCount: this.enemies.length,
            killCount: this.killCount,
        });

        // Music heats up with run time and adaptive difficulty; boss = max
        const timeHeat = Math.min(1, this.gameTime / 480);
        const adaptHeat = (difficultyDirector.intensity - 0.6) / 2.4;
        const bossActive = this.finalBossSpawned && this.finalBoss !== null && !this.finalBoss.isDead;
        audio.setMusicIntensity(bossActive ? 1 : 0.15 + 0.55 * timeHeat + 0.3 * adaptHeat);

        for (const event of difficultyDirector.consumeEvents()) {
            if (event.type === 'burst') {
                // Ring of enemies converging on the player
                for (let i = 0; i < event.count; i++) {
                    this.spawnEnemy({ angle: (i / event.count) * Math.PI * 2 });
                }
            } else if (event.type === 'miniboss') {
                this.spawnEnemy({ boss: true });
                audio.play('bossSpawn');
                juice.flash('#ff2244', 0.28, 0.45);
                juice.pulseVignette(0.8);
                juice.addTrauma(0.35);
            } else if (event.type === 'arena') {
                arenaEvents.trigger(this.currentStage.event, this.arenaContext());
            }
        }

        // Stage hazard: telegraphs, impacts and the station blackout
        arenaEvents.update(dt, this.arenaContext());
        stageBackdrop.blackout = arenaEvents.blackoutAmount;

        const spawnCount = difficultyDirector.takeSpawnCount(this.enemies.length);
        for (let i = 0; i < spawnCount; i++) {
            this.spawnEnemy();
        }

        // Stage final boss: appears once the survival timer runs out
        if (!this.finalBossSpawned && this.gameTime >= this.currentStage.duration) {
            this.finalBossSpawned = true;
            this.spawnEnemy({ boss: true, final: true });
            audio.play('bossSpawn');
            juice.addTrauma(0.9);
            juice.flash('#ff0033', 0.5, 0.7);
            juice.pulseVignette(1);
            juice.zoomPunch(-0.9);
            juice.slowMo(0.35, 0.5);
            if (this.finalBoss) {
                juice.shockwave(this.finalBoss.pos.x, this.finalBoss.pos.y, 420, '#ff3355', 0.8, 10);
            }
        }

        this.player.update(dt);
        // Obstacles: stream in the chunks around the player, then stop them
        // from walking through cover
        propField.update(this.player.pos);
        propField.resolve(this.player);
        // Rebuild the spatial hash BEFORE anything queries it. Weapons target
        // through it, so when this ran after them they were aiming at last
        // frame's snapshot — and on the first frame of a new run that snapshot
        // was the *previous run's* enemies, still sitting where they died. That
        // is the "I press start and a weapon immediately fires and damage
        // numbers appear" bug: it was shooting ghosts.
        levelSpatialHash.clear();
        levelSpatialHash.insertAll(this.enemies);

        this.player.weapons.forEach(w => w.update(dt));

        // Reset enemy stats and forces before updates/collisions
        // (enemies hunt faster while a blackout is running)
        const hazardSpeed = arenaEvents.enemySpeedMultiplier;
        this.enemies.forEach(e => {
            e.speedMultiplier = hazardSpeed;
            e.resetForces();
        });

        // Separation forces for each enemy
        for (const enemy of this.enemies) {
            // Get nearby enemies from spatial grid (O(1) average case)
            const nearby = levelSpatialHash.getNearby(enemy.pos, enemy.radius * 3);

            for (const other of nearby) {
                if (other === enemy) continue;
                enemy.addSeparationFrom(other, 200); // Separation strength
            }
        }

        for (let i = this.entities.length - 1; i >= 0; i--) {
            const e = this.entities[i];
            e.update(dt);
            if (e.isDead) {
                this.entities.splice(i, 1);
            }
        }

        // Collisions - delegated to CollisionSystem
        collisionSystem.processEntityCollisions(this.entities);

        // Damage over time / stuns tick before movement so a lethal tick doesn't
        // let the enemy take one more step
        status.update(dt, this.enemies);

        // Update enemies (Move) AFTER collisions have potentially applied slows
        this.enemies.forEach(e => e.update(dt, this.player!.pos));

        // Enemies flow around obstacles; bosses are big enough to plough through
        for (const e of this.enemies) {
            if (e.isBoss) continue;
            propField.resolve(e, this.player.pos, e.speed * e.speedMultiplier * 0.7, dt);
        }

        // === PLAYER-ENEMY CONTACT ===
        // Every enemy touching the player bites on its own timer — see
        // core/ContactDamage. There are no global i-frames anywhere on this
        // path, so twelve enemies land twelve bites; that is the whole point.
        const touching: Enemy[] = [];
        for (const e of this.enemies) {
            // Contact reaches a little past the shove — see CONTACT_REACH
            const gap = distance(e.pos, this.player.pos) - e.radius - this.player.radius;
            if (gap > CONTACT_REACH) continue;

            touching.push(e);
            if (gap > 0) continue; // close enough to bite, not close enough to shove

            // Calculate direction from enemy to player
            const dx = this.player.pos.x - e.pos.x;
            const dy = this.player.pos.y - e.pos.y;
            const dist = distance(this.player.pos, e.pos);

            if (dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;

                // The player shoulders through; enemies give way.
                //
                // These used to be 150 on the player and 75 on the enemy, which
                // is backwards for a pile: pushes from opposite sides cancel, so
                // a surrounded player was pinned in place and could only wait
                // for their weapons to chew an exit. Shoving the enemy harder
                // than the player opens a gap you can walk out of, and the
                // smaller self-knockback stops the pile from yanking the camera
                // around while you steer.
                this.player.applyKnockback(nx, ny, PLAYER_SHOVE_BACK);
                e.applyKnockback(-nx, -ny, ENEMY_SHOVE);
            }
        }

        this.resolveContact(touching, dt);

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].isDead) {
                const enemy = this.enemies[i];
                // A contagious infection jumps to the neighbours on death
                status.onEnemyDeath(enemy);
                // Death burst in the enemy's palette color
                particles.emitHit(enemy.pos.x, enemy.pos.y, sprites.getEnemyBodyColor(enemy.name));
                audio.play('enemyDeath');
                if (enemy.isBoss) {
                    audio.play('explosion');
                    particles.emitExplosion(enemy.pos.x, enemy.pos.y, enemy.radius * 2, [
                        sprites.getEnemyAccentColor(enemy.name),
                        sprites.getEnemyBodyColor(enemy.name),
                        '#ffffff',
                    ]);
                    // Boss deaths get the full treatment: freeze, punch, ring
                    juice.hitStop(0.12);
                    juice.addTrauma(0.7);
                    juice.zoomPunch(0.7);
                    juice.flash('#ffffff', 0.4, 0.35);
                    juice.shockwave(enemy.pos.x, enemy.pos.y, enemy.radius * 12, sprites.getEnemyAccentColor(enemy.name), 0.6, 9);
                } else if (enemy.isElite) {
                    juice.addTrauma(0.12);
                    juice.shockwave(enemy.pos.x, enemy.pos.y, enemy.radius * 5, sprites.getEnemyAccentColor(enemy.name), 0.3, 4);
                }
                // Tactics that trigger on death (see core/Tactics)
                this.killEcho(enemy);
                this.feedFungus(enemy);
                this.chipBossArmor(enemy);
                if (Math.random() < this.player.stats.siphon) {
                    this.repairCells.push(new RepairCell(enemy.pos.x, enemy.pos.y));
                }

                // Drop XP crystals instead of giving XP directly
                const crystalValue = enemy.xpValue;
                this.crystals.spawn(enemy.pos.x, enemy.pos.y, crystalValue);
                this.enemies.splice(i, 1);
                this.killCount++;
                this.killScore += enemy.xpValue;
                this.runStats.recordKill(enemy.maxHp, enemy.lastHitBy);
            }
        }

        // Repair cells: healing you have to walk to
        for (let i = this.repairCells.length - 1; i >= 0; i--) {
            const cell = this.repairCells[i];
            cell.update(dt, this.player.pos);

            if (checkCollision(cell, this.player)) {
                // Worth a share of what you are MISSING, so healing cannot
                // quietly refund a whole run of chip damage — see repairHeal
                this.player.heal(repairHeal(this.player.hp, this.player.maxHp));
                audio.play('pickup');
                particles.emitHit(cell.pos.x, cell.pos.y, '#ff6b8a');
                this.repairCells.splice(i, 1);
            } else if (cell.isDead) {
                this.repairCells.splice(i, 1);
            }
        }

        // Anything on the field that gathers loose crystals says so by carrying
        // a `crystalPull` — no class list, same duck-typing as `layer`
        const attractors: CrystalAttractor[] = [];
        for (const e of this.entities) {
            const pull = (e as Partial<CrystalAttractor>).crystalPull;
            if (pull && pull > 0) attractors.push(e as unknown as CrystalAttractor);
        }
        this.crystals.update(dt, this.player, this.canvas.width, this.canvas.height, attractors);

        if (this.player.isDead && !this.secondWind()) {
            this.state = 'GAME_OVER';
            this.showGameOver();
        } else if (this.finalBoss?.isDead) {
            this.state = 'GAME_OVER';
            this.showVictory();
        }

        // Smooth camera follow
        const targetX = this.player.pos.x - this.canvas.width / 2;
        const targetY = this.player.pos.y - this.canvas.height / 2;
        const followSpeed = Math.min(1, dt * 10);
        this.camera.x += (targetX - this.camera.x) * followSpeed;
        this.camera.y += (targetY - this.camera.y) * followSpeed;

        this.damageNumbers.update(dt);
        this.updateParticles(dt);
        this.updateHUD();
    }

    /** Everything the achievement conditions are allowed to see */
    runSnapshot(): RunSnapshot {
        const stats = this.runStats.stats;
        let evolved = 0;
        for (const level of this.weaponLevels.values()) if (level >= 6) evolved++;
        let maxStack = 0;
        for (const stacks of this.powerupLevels.values()) maxStack = Math.max(maxStack, stacks);

        return {
            seconds: this.gameTime,
            kills: this.killCount,
            level: this.player?.level ?? 1,
            evolvedWeapons: evolved,
            weapons: this.weaponLevels.size,
            maxPowerupStack: maxStack,
            longestUntouched: stats.longestUntouched,
            bestHit: stats.bestHit,
            bestMultikill: stats.bestMultikill,
            hpRatio: this.player ? this.player.hp / this.player.maxHp : 1,
            victory: this.finalBoss?.isDead === true,
            threat: this.stageThreat,
        };
    }

    /**
     * The stage's HP multiplier, ramped in over the opening minute.
     *
     * A hard stage applied its full `hpScale` from second zero, so the first
     * thing a Void Nexus run ever showed you was a tier-3 enemy at x1.9 health
     * against a level-1 weapon. The moment the whole opening minute of a
     * survivors-like is built around — swing, it dies, swing, it dies — simply
     * never happened there, and the play report was blunt about it: the easy
     * stage was more fun because things died to one hit.
     *
     * Ramping it in keeps every stage's first minute feeling the same and lets
     * the difference grow from there. What makes a stage hard is still its
     * enemy pool, its spawn density and its length — none of which move.
     */
    private stageHpScale(): number {
        const ramp = Math.min(1, this.gameTime / STAGE_SCALE_RAMP);
        return 1 + (this.currentStage.hpScale - 1) * ramp;
    }

    /** Arena threat used as the score multiplier — see core/Score */
    private get stageThreat(): number {
        return (this.currentStage.hpScale + this.currentStage.damageScale) / 2;
    }

    /** Score as it stands right now (HUD reads this every frame) */
    get liveScore(): number {
        return computeScore({
            killScore: this.killScore,
            seconds: this.gameTime,
            level: this.player?.level ?? 1,
            threat: this.stageThreat,
            victory: false,
        });
    }

    /** Finalise the run's score and put it on the local leaderboard */
    private submitRunScore(victory: boolean): { score: number; rank: number } {
        const score = computeScore({
            killScore: this.killScore,
            seconds: this.gameTime,
            level: this.player?.level ?? 1,
            threat: this.stageThreat,
            victory,
        });

        const { rank } = submitScore({
            score,
            stageId: this.currentStage.id,
            classId: this.classId,
            seconds: this.gameTime,
            kills: this.killCount,
            level: this.player?.level ?? 1,
            victory,
            date: Date.now(),
        });

        return { score, rank };
    }

    /**
     * Close the run out: award achievements, settle the score, and hand a
     * snapshot to the result panel. The panel itself is pure presentation and
     * lives in ui/screens/RunSummaryOverlay — everything that *changes* state
     * has to happen here, before it is handed over.
     */
    private endRun(variant: 'defeat' | 'victory', title: string, subtitle: string) {
        achievements.check(this.runSnapshot());
        const { score, rank } = this.submitRunScore(variant === 'victory');

        showRunSummary(this.uiLayer, {
            title,
            subtitle,
            variant,
            seconds: this.gameTime,
            kills: this.killCount,
            level: this.player?.level ?? 1,
            score,
            rank,
            stats: this.runStats.stats,
            weaponLevels: this.weaponLevels,
            powerupLevels: this.powerupLevels,
            // Raw English, not the localised label: this dump is read next to
            // the code, where everything is called by its English name
            stageName: this.currentStage.name,
            className: this.player?.className ?? '',
            playerStats: { ...(this.player?.stats ?? {}) } as Record<string, number>,
            maxHp: this.player?.maxHp ?? 0,
        });
    }

    showGameOver() {
        audio.stopMusic();
        audio.play('gameOver');
        juice.flash('#ff0022', 0.5, 0.8);
        juice.slowMo(0.25, 1.2);
        juice.pulseVignette(1);
        if (this.player) {
            particles.emitExplosion(this.player.pos.x, this.player.pos.y, 90, ['#ff3344', '#ffffff', '#661122']);
        }
        this.endRun(
            'defeat',
            t('result.gameOver'),
            t('result.defeatSubtitle', { stage: stageName(this.currentStage) }),
        );
    }

    showVictory() {
        audio.stopMusic();
        audio.play('victory');
        juice.flash('#ffffff', 0.6, 0.9);
        juice.zoomPunch(0.8);
        juice.slowMo(0.3, 1);
        this.endRun(
            'victory',
            t('result.victory'),
            t('result.victorySubtitle', { stage: stageName(this.currentStage) }),
        );
    }

    spawnEnemy(options: { boss?: boolean; final?: boolean; angle?: number; at?: Vector2 } = {}) {
        if (!this.player) return;
        const angle = options.angle ?? Math.random() * Math.PI * 2;
        const dist = Math.max(this.canvas.width, this.canvas.height) / 2 + 100;
        // Arena hazards (rifts) spawn at a fixed point instead of off-screen
        const x = options.at ? options.at.x : this.player.pos.x + Math.cos(angle) * dist;
        const y = options.at ? options.at.y : this.player.pos.y + Math.sin(angle) * dist;

        // Wave lasts 60 seconds; enemy mix shifts 90%/10% → 10%/90%
        const WAVE_DURATION = 60;
        const waveIndex = Math.floor(this.gameTime / WAVE_DURATION);
        const waveProgress = (this.gameTime % WAVE_DURATION) / WAVE_DURATION;

        // The stage defines which enemies appear and in what order
        const pool = this.currentStage.enemyPool;
        const primaryIndex = pool[Math.min(waveIndex, pool.length - 2)];
        const secondaryIndex = pool[Math.min(waveIndex + 1, pool.length - 1)];
        const secondaryChance = 0.1 + (waveProgress * 0.8);

        // Bosses are always the upcoming wave's enemy type; the stage's final
        // boss is the strongest enemy of its pool
        const type = options.final
            ? ENEMIES[pool[pool.length - 1]]
            : options.boss || Math.random() < secondaryChance
                ? ENEMIES[secondaryIndex]
                : ENEMIES[primaryIndex];

        const isElite = !options.boss && Math.random() < difficultyDirector.getEliteChance(this.gameTime);

        const enemy = new Enemy(x, y, type, isElite);

        // Time + player level + adaptive + stage scaling. Level matters because
        // banking a crowd of un-killed enemies and cashing the whole XP pile at
        // once used to buy five levels against minute-three enemies — see
        // DifficultyDirector.effectiveTime.
        const level = this.player?.level ?? 0;
        // The stage's toughness fades IN over the opening minute, and the XP it
        // is worth fades in with it. See stageHpScale.
        const stageScale = this.stageHpScale();
        enemy.maxHp = enemy.maxHp * difficultyDirector.getHpMultiplier(this.gameTime, level) * stageScale;
        enemy.xpValue = Math.max(1, Math.round(enemy.xpValue * (stageScale / this.currentStage.hpScale)));
        enemy.hp = enemy.maxHp;

        // `enemy.damage` is NOT scaled. Contact damage is the one number that
        // stays put across a run — it used to be multiplied here by time,
        // intensity and stage on top of its tier curve, which is how a bite
        // reached 87 against a 115 HP pool. Late game escalates through health
        // and count, both of which are right above this line. See
        // core/ContactDamage before adding a multiplier back.

        if (options.boss) {
            enemy.makeBoss();
            if (options.final) {
                // Final boss: tougher than a wave miniboss, but nothing like
                // the x3 it used to be. Net of makeBoss that was x36 of a late
                // enemy against a build landing 4,000 a second on one target —
                // a ten-minute fight. See core/BossArmor.
                enemy.hp *= 1.5;
                enemy.maxHp *= 1.5;
                // Only the final boss wears armour — see core/BossArmor
                enemy.armored = true;
                enemy.radius *= 1.3;
                enemy.xpValue *= 3;
                this.finalBoss = enemy;
            }
        }

        // How tough the arena is right now, for the run's time-to-kill. Bosses
        // are left out: one body worth twelve would swamp the average and turn
        // the number into a boss-fight statistic.
        if (!options.boss) this.runStats.recordSpawn(enemy.maxHp);

        this.enemies.push(enemy);
    }

    /** Everything the arena hazards need from the run, in one object */
    private arenaContext(): ArenaContext {
        return {
            playerPos: this.player!.pos,
            damagePlayer: (fraction: number) => this.hazardDamage(fraction),
            spawnAt: (x: number, y: number) => this.spawnEnemy({ at: { x, y } }),
            viewWidth: this.canvas.width,
            viewHeight: this.canvas.height,
            gameTime: this.gameTime,
        };
    }

    /**
     * Environmental damage as a fraction of max HP — hazards should sting at
     * every point of the run, so they don't use flat numbers.
     */
    private hazardDamage(fraction: number) {
        if (!this.player) return;
        const before = this.player.hp;
        this.player.takeDamage(this.player.maxHp * fraction);
        // i-frames can swallow the hit entirely — only a real one breaks the streak
        if (this.player.hp < before) {
            this.runStats.onPlayerHurt();
            this.runStats.recordHazard(before - this.player.hp);
        }
        audio.play('hurt');
        juice.addTrauma(0.35);
        juice.flash('#ff5a1e', 0.2, 0.25);
        juice.pulseVignette(0.6);
    }

    /** Trigger screen shake (magnitude in px, duration in seconds) */
    shake(magnitude: number, duration: number) {
        juice.shake(magnitude, duration);
    }

    /** Camera with the current shake offset applied (used for rendering only) */
    private getRenderCamera(): Vector2 {
        const offset = juice.getShakeOffset();
        return { x: this.camera.x + offset.x, y: this.camera.y + offset.y };
    }

    draw(ctx: CanvasRenderingContext2D) {
        // GAME_OVER keeps rendering so the result panel sits on a freeze-frame
        // of the battlefield instead of a black void.
        if (this.state !== 'PLAYING' && this.state !== 'LEVEL_UP' && this.state !== 'GAME_OVER') return;

        // Reset canvas state at the start of each frame
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        const camera = this.getRenderCamera();

        // Camera punch: scale + roll the whole world around the screen centre.
        // Applied as a canvas transform so every entity inherits it for free.
        const zoom = juice.getZoom();
        const roll = juice.getShakeAngle();
        const transformed = zoom !== 1 || roll !== 0;
        if (transformed) {
            ctx.save();
            ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            ctx.rotate(roll);
            ctx.scale(zoom, zoom);
            ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);
        }

        this.drawBackground(ctx, camera);
        propField.draw(ctx, camera, this.canvas.width, this.canvas.height);
        arenaEvents.drawWorld(ctx, camera);

        // Ground layer: zones and anything else that lies on the floor
        for (const e of this.entities) {
            if (e.layer === 'ground') e.draw(ctx, camera);
        }

        this.crystals.draw(ctx, camera, this.canvas.width, this.canvas.height);
        this.repairCells.forEach(c => c.draw(ctx, camera));

        this.enemies.forEach(e => e.draw(ctx, camera));

        this.player?.draw(ctx, camera);

        // Air layer: projectiles, swings and trails, over the player
        for (const e of this.entities) {
            if (e.layer === 'air') e.draw(ctx, camera);
        }

        // Draw particles
        particles.draw(ctx, camera);

        // Shockwave rings (explosions, boss deaths)
        juice.drawWorld(ctx, camera);

        this.damageNumbers.draw(ctx, camera);

        if (transformed) ctx.restore();

        // Stage lighting sits above the world but below the HUD and juice flashes
        stageBackdrop.drawLighting(ctx, this.canvas.width, this.canvas.height);
        arenaEvents.drawBanner(ctx, this.canvas.width, this.canvas.height);

        // Draw debug overlay (FPS, stats)
        debugOverlay.draw(ctx);
    }

    drawBackground(ctx: CanvasRenderingContext2D, camera: Vector2) {
        stageBackdrop.draw(ctx, camera, this.canvas.width, this.canvas.height);
    }

    getProjectileColor(emoji: string): string {
        // Map emojis to particle colors
        const colorMap: Record<string, string> = {
            '🔥': '#ff6600',
            '❄️': '#88ccff',
            '⚡': '#ffff00',
            '🟢': '#00ff00',
            '⚫': '#8800ff',
            '💿': '#00ffff',
            '🗡️': '#cccccc',
            '⚔️': '#ffffff',
            '🦠': '#88ff00',
            '🧪': '#00ff88',
            '🔋': '#00ff00',
            '💥': '#ff8800',
            '🛸': '#8888ff',
            '🧠': '#ff00ff',
            '☢️': '#ffff00',
        };

        return colorMap[emoji] || '#ffffff';
    }

    updateParticles(dt: number) {
        particles.update(dt);
    }
}
