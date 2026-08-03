import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { CrystalField } from './entities/CrystalField';
import { DamageNumbers } from './core/DamageNumbers';
import { Entity } from './Entity';
import { CLASSES, ENEMIES, WEAPONS } from './data/GameData';
import { checkCollision, type Vector2, distance, formatTime } from './core/Utils';
import { levelSpatialHash } from './core/SpatialHash';
import { particles } from './core/ParticleSystem';
import { stateMachine, type GameState } from './core/StateMachine';
import { damageSystem } from './core/DamageSystem';
import { debugOverlay } from './core/DebugOverlay';
import { collisionSystem } from './core/CollisionSystem';
import { difficultyDirector } from './core/DifficultyDirector';
import { sprites } from './core/SpriteFactory';
import { stageBackdrop } from './core/StageBackdrop';
import { propField } from './core/PropField';
import { arenaEvents, type ArenaContext } from './core/ArenaEvents';
import { status } from './core/StatusEffects';
import { STAGES, type StageConfig } from './data/StageData';
import { audio } from './core/AudioSystem';
import { juice } from './core/JuiceSystem';
import { getPowerupValue, POWERUP_STACK_CAP } from './core/UpgradePool';
import { contactDamagePerSecond } from './core/ContactDamage';
import { computeScore, submitScore } from './core/Score';
import { RunStatsTracker } from './core/RunStats';
import { achievements, type RunSnapshot } from './core/Achievements';
import { RepairCell } from './entities/RepairCell';
import {
    dischargeThreshold, DISCHARGE_RADIUS, DISCHARGE_DAMAGE, DISCHARGE_KNOCKBACK,
    KILL_ECHO_RADIUS, KILL_ECHO_DAMAGE_SHARE, KILL_ECHO_BURN_SHARE, KILL_ECHO_BOSS_RESIST,
} from './core/Tactics';
import { screenManager } from './ui/ScreenManager';
import { LevelUpOverlay } from './ui/screens/LevelUpOverlay';
import { showRunSummary } from './ui/screens/RunSummaryOverlay';
import { PauseOverlay } from './ui/screens/PauseOverlay';

import { t } from './core/I18n';
import { stageName } from './core/Labels';

/**
 * Contact hurt cue: play at most this often, and only once this share of max
 * HP has actually been lost since the last one. Two gates rather than a timer
 * because the cue has to be rare when you are grazed and frequent when you are
 * being eaten — without ever turning into a machine-gun.
 */
const CONTACT_SOUND_MIN_GAP = 0.75;
const CONTACT_SOUND_HP_SHARE = 0.05;

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
    /** Contact damage taken since the last hurt cue */
    private contactDamageBank: number = 0;
    /** Absorbed damage banked toward the next Static Discharge */
    private capacitorCharge: number = 0;
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
            // The weapon id lives on the weapon, but the hit may come from a
            // projectile or a zone it spawned — hence the two hops
            const weaponId = source?.weaponId ?? source?.source?.weaponId ?? null;
            this.runStats.recordHit(amount, isCrit, weaponId);
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
        this.player.onHeal = amount => this.runStats.recordHeal(amount);

        // Add starting weapon
        this.addWeapon(cls.weaponId);

        this.enemies = [];
        this.entities = [];
        this.crystals.clear();
        this.repairCells = [];
        this.capacitorCharge = 0;
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
     * Hurt feedback while enemies are on the player.
     *
     * Getting stuck in a pack is a *sustained state*, not an event, and every
     * event-shaped cue is wrong for it. Earlier versions fired a beat every
     * 0.28s carrying camera shake and a hurt blip: buried in a crowd that became
     * a machine-gun of "tk-tk-tk-tk" with the arena shaking too hard to read —
     * exactly when the player most needs to see where the gap is.
     *
     * So: no camera shake from contact at all, and the sound is gated on damage
     * actually taken rather than on a clock. A graze beeps rarely; being eaten
     * beeps often, but never faster than CONTACT_SOUND_MIN_GAP. The continuous
     * readouts — the HP bar, the edge vignette and the player flashing red —
     * carry the rest.
     */
    private emitContactFeedback(dps: number, dt: number) {
        if (!this.player) return;

        this.contactDamageBank += dps * dt;
        this.contactFxTimer -= dt;

        const beat = this.player.maxHp * CONTACT_SOUND_HP_SHARE;
        if (this.contactDamageBank < beat || this.contactFxTimer > 0) return;

        this.contactDamageBank = 0;
        this.contactFxTimer = CONTACT_SOUND_MIN_GAP;

        audio.play('hurt');
        // Edge-only, and it deepens as HP drops — readable without hiding the
        // middle of the screen where the enemies are
        juice.pulseVignette(0.3 + (1 - this.player.hp / this.player.maxHp) * 0.5);
    }

    /**
     * Static Discharge: the capacitor is charged by the damage you absorb, so
     * the perk is strongest exactly when being surrounded is about to kill you.
     */
    private chargeCapacitor(dps: number, dt: number) {
        if (!this.player || this.player.stats.discharge <= 0) return;

        this.capacitorCharge += dps * dt;
        const threshold = dischargeThreshold(this.player.stats.discharge);
        if (this.capacitorCharge < threshold) return;

        this.capacitorCharge = 0;
        const radius = DISCHARGE_RADIUS * this.player.stats.area;
        const damage = DISCHARGE_DAMAGE * this.player.stats.discharge;

        audio.play('explosion');
        juice.addTrauma(0.35);
        juice.shockwave(this.player.pos.x, this.player.pos.y, radius * 1.4, '#8ce8ff', 0.45, 6);
        particles.emitLightning(this.player.pos.x, this.player.pos.y);

        for (const enemy of levelSpatialHash.getWithinRadius(this.player.pos, radius)) {
            if (distance(this.player.pos, enemy.pos) > radius) continue;
            damageSystem.dealDamage({
                baseDamage: damage,
                source: { owner: this.player },
                target: enemy,
                position: enemy.pos,
            });
            const dx = enemy.pos.x - this.player.pos.x;
            const dy = enemy.pos.y - this.player.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            enemy.applyKnockback(dx / len, dy / len, DISCHARGE_KNOCKBACK);
        }
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
        if (Math.random() >= this.player.stats.killEcho) return;

        const radius = KILL_ECHO_RADIUS * this.player.stats.area;

        particles.emitExplosion(enemy.pos.x, enemy.pos.y, radius, ['#ffd166', '#ff6b35', '#ffffff']);
        juice.shockwave(enemy.pos.x, enemy.pos.y, radius * 1.5, '#ffb03c', 0.3, 4);

        for (const other of levelSpatialHash.getWithinRadius(enemy.pos, radius)) {
            if (other === enemy || other.isDead) continue;
            if (distance(enemy.pos, other.pos) > radius) continue;
            // A share of the target's CURRENT health, so the blast fades as it
            // weakens — see KILL_ECHO_DAMAGE_SHARE
            const share = other.isBoss ? KILL_ECHO_DAMAGE_SHARE * KILL_ECHO_BOSS_RESIST : KILL_ECHO_DAMAGE_SHARE;
            // ...and it may never land the killing blow. That is what makes a
            // cascade impossible rather than merely unlikely: no echo produces
            // a corpse, so no echo produces another echo.
            const damage = Math.min(other.hp * share, Math.max(0, other.hp - 1));

            if (damage > 0) {
                damageSystem.dealDamage({
                    baseDamage: damage,
                    source: null,
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
                dps: other.maxHp * KILL_ECHO_BURN_SHARE,
                duration: 2.5,
                source: undefined,
                kind: 'burn',
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

        // Apply stat boost
        if (opt.type in this.player.stats) {
            (this.player.stats as any)[opt.type] += value;
        }

        // Backstop only: the powerup caps keep cooldown at 0.60, and only a
        // long Storm Mage run can push it lower. Zone tick intervals scale with
        // this stat too, so it must never reach zero.
        if (this.player.stats.cooldown < 0.25) this.player.stats.cooldown = 0.25;

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
        // Contact damage is continuous (HP/second) and every overlapping enemy
        // contributes — see core/ContactDamage for why, and for the armor and
        // crowd-stacking rules. It deliberately does NOT use takeDamage(),
        // whose i-frames would cap a 40-enemy pile at the same 2 HP/s as one bat.
        const contactDamages: number[] = [];
        for (const e of this.enemies) {
            if (!checkCollision(e, this.player)) continue;

            contactDamages.push(e.damage);

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

        if (contactDamages.length > 0) {
            const dps = contactDamagePerSecond(contactDamages, this.player.stats.armor);
            this.player.takeContactDamage(dps, dt);
            this.runStats.onPlayerHurt();
            this.emitContactFeedback(dps, dt);
            this.chargeCapacitor(dps, dt);
        } else {
            this.contactFxTimer = 0;
            this.contactDamageBank = 0;
        }

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
                if (Math.random() < this.player.stats.siphon) {
                    this.repairCells.push(new RepairCell(enemy.pos.x, enemy.pos.y));
                }

                // Drop XP crystals instead of giving XP directly
                const crystalValue = enemy.xpValue;
                this.crystals.spawn(enemy.pos.x, enemy.pos.y, crystalValue);
                this.enemies.splice(i, 1);
                this.killCount++;
                this.killScore += enemy.xpValue;
                this.runStats.recordKill();
            }
        }

        // Repair cells: healing you have to walk to
        for (let i = this.repairCells.length - 1; i >= 0; i--) {
            const cell = this.repairCells[i];
            cell.update(dt, this.player.pos);

            if (checkCollision(cell, this.player)) {
                this.player.heal(cell.heal);
                audio.play('pickup');
                particles.emitHit(cell.pos.x, cell.pos.y, '#ff6b8a');
                this.repairCells.splice(i, 1);
            } else if (cell.isDead) {
                this.repairCells.splice(i, 1);
            }
        }

        this.crystals.update(dt, this.player, this.canvas.width, this.canvas.height);

        if (this.player.isDead) {
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
        enemy.maxHp = enemy.maxHp * difficultyDirector.getHpMultiplier(this.gameTime, level) * this.currentStage.hpScale;
        enemy.hp = enemy.maxHp;
        enemy.damage *= difficultyDirector.getDamageMultiplier(this.gameTime, level) * this.currentStage.damageScale;

        if (options.boss) {
            enemy.makeBoss();
            if (options.final) {
                // Final boss: considerably tougher than wave minibosses
                enemy.hp *= 3;
                enemy.maxHp *= 3;
                enemy.radius *= 1.3;
                enemy.xpValue *= 3;
                this.finalBoss = enemy;
            }
        }

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
        if (this.player.hp < before) this.runStats.onPlayerHurt();
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
