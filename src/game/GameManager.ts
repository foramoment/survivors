import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { XPCrystal } from './entities/XPCrystal';
import { Entity } from './Entity';
import { CLASSES, POWERUPS, ENEMIES, WEAPONS } from './data/GameData';
import { checkCollision, type Vector2, distance } from './core/Utils';
import { Projectile, Zone } from './weapons/base';
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
import { drawPixelText } from './core/PixelFont';
import { buildUpgradeOptions, getPowerupValue, formatPowerupBonus, formatStatPreview, POWERUP_STACK_CAP } from './core/UpgradePool';
import { contactDamagePerSecond } from './core/ContactDamage';
import { computeScore, submitScore, formatScore } from './core/Score';
import { RunStatsTracker } from './core/RunStats';
import { achievements, type RunSnapshot } from './core/Achievements';
import { RepairCell } from './entities/RepairCell';
import {
    dischargeThreshold, DISCHARGE_RADIUS, DISCHARGE_DAMAGE, DISCHARGE_KNOCKBACK,
    KILL_ECHO_RADIUS, KILL_ECHO_DAMAGE_SHARE, KILL_ECHO_BURN_SHARE, KILL_ECHO_BOSS_RESIST,
} from './core/Tactics';
import { screenManager } from './ui/ScreenManager';

import { createSettingsPanel } from './ui/components/SettingsPanel';
import { i18n, t } from './core/I18n';
import { AUTHOR_CREDIT } from './core/Credits';
import {
    weaponName, weaponDesc, weaponEvoName, weaponEvoDesc,
    powerupName, powerupDesc, stageName,
} from './core/Labels';

/**
 * Contact hurt cue: play at most this often, and only once this share of max
 * HP has actually been lost since the last one. Two gates rather than a timer
 * because the cue has to be rare when you are grazed and frequent when you are
 * being eaten — without ever turning into a machine-gun.
 */
const CONTACT_SOUND_MIN_GAP = 0.75;
const CONTACT_SOUND_HP_SHARE = 0.05;

/**
 * XP crystal housekeeping. Crystals are permanent, so the cost is capped by
 * ignoring the ones nobody can see and merging the ones far behind you.
 */
const CRYSTAL_ACTIVE_MARGIN = 120;
const CRYSTAL_SOFT_CAP = 900;
const CRYSTAL_MERGE_DISTANCE = 1400;
const CRYSTAL_MERGE_CELL = 190;

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
    projectiles: (Projectile | Zone)[] = [];
    xpCrystals: XPCrystal[] = [];
    damageNumbers: { x: number, y: number, vx: number, vy: number, text: string, life: number, maxLife: number, isCrit?: boolean }[] = [];

    camera: Vector2 = { x: 0, y: 0 };

    /** Real time of the last crit hit-stop, to rate-limit the effect */
    private lastCritStop: number = 0;

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
    /** Countdown to the next distant-crystal merge pass */
    private crystalMergeTimer: number = 1;
    repairCells: RepairCell[] = [];
    private pauseOverlay: HTMLElement | null = null;
    /** Survives a pause-overlay rebuild so a language switch keeps the panel open */
    private pauseSettingsOpen: boolean = false;
    private pauseI18nUnsub: (() => void) | null = null;
    /** Level-up keyboard cursor */
    private upgradeCards: HTMLElement[] = [];
    private focusedCard: number = 0;
    private upgradeKeyHandler: ((e: KeyboardEvent) => void) | null = null;



    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.uiLayer = document.getElementById('ui-layer')!;

        // Connect DamageSystem to damage number display
        damageSystem.setDamageNumberCallback((pos, amount, isCrit, source) => {
            this.spawnDamageNumber(pos, amount, isCrit);
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
        this.pauseOverlay?.remove();
        this.pauseOverlay = null;
        this.detachUpgradeKeys();
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
        this.player.onLevelUp = () => this.showLevelUp();
        this.player.onHeal = amount => this.runStats.recordHeal(amount);

        // Add starting weapon
        this.addWeapon(cls.weaponId);

        this.enemies = [];
        this.projectiles = [];
        this.xpCrystals = [];
        this.repairCells = [];
        this.capacitorCharge = 0;
        this.damageNumbers = [];
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

    /** Types already reported as dropped, so one bad weapon can't spam the log */
    private droppedEntityTypes = new Set<string>();

    spawnEntity(entity: Entity) {
        if (entity instanceof Projectile || entity instanceof Zone) {
            this.projectiles.push(entity as any);
            audio.play('shoot');
            return;
        }

        // The arena only ever iterates `projectiles`, so anything else lands
        // nowhere: never updated, never drawn. Blood Cleaver's swing arc
        // extended Entity directly and shipped like that — the weapon dealt
        // full damage while being completely invisible, which reads as "this
        // weapon does nothing" rather than as a bug. Silence was the whole
        // problem, so say something.
        const kind = entity.constructor.name;
        if (!this.droppedEntityTypes.has(kind)) {
            this.droppedEntityTypes.add(kind);
            console.warn(`[GameManager] ${kind} was dropped: onSpawn only accepts Projectile or Zone.`);
        }
    }

    /**
     * Cracked-glass overlay for the level-up slam.
     * Cracks are generated per level-up (random impact point + branching
     * fractures), so the break never looks the same twice.
     */
    private createImpactOverlay(): HTMLElement {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'crack-overlay');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');

        const ox = 30 + Math.random() * 40;
        const oy = 30 + Math.random() * 40;
        const spokes = 7 + Math.floor(Math.random() * 5);

        for (let i = 0; i < spokes; i++) {
            const baseAngle = (i / spokes) * Math.PI * 2 + Math.random() * 0.4;
            let x = ox;
            let y = oy;
            let points = `${x},${y}`;
            const segments = 3 + Math.floor(Math.random() * 3);
            for (let s = 0; s < segments; s++) {
                const len = 8 + Math.random() * 22;
                const angle = baseAngle + (Math.random() - 0.5) * 0.7;
                x += Math.cos(angle) * len;
                y += Math.sin(angle) * len;
                points += ` ${x.toFixed(1)},${y.toFixed(1)}`;
            }
            const line = document.createElementNS(svgNS, 'polyline');
            line.setAttribute('points', points);
            line.setAttribute('class', 'crack-line');
            line.style.animationDelay = `${(Math.random() * 0.08).toFixed(3)}s`;
            svg.appendChild(line);
        }

        // A couple of concentric fracture rings around the impact
        for (let r = 1; r <= 2; r++) {
            const ring = document.createElementNS(svgNS, 'circle');
            ring.setAttribute('cx', ox.toFixed(1));
            ring.setAttribute('cy', oy.toFixed(1));
            ring.setAttribute('r', String(r * 7 + Math.random() * 4));
            ring.setAttribute('class', 'crack-ring');
            svg.appendChild(ring);
        }

        return svg as unknown as HTMLElement;
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
        this.buildPauseOverlay();

        // Switching language from the pause panel relabels the whole overlay.
        // Rebuilding it is simpler (and cheaper, once) than tracking every node.
        this.pauseI18nUnsub = i18n.onChange(() => {
            if (this.state !== 'PAUSED') return;
            this.pauseOverlay?.remove();
            this.buildPauseOverlay();
        });
    }

    private buildPauseOverlay() {
        const screen = document.createElement('div');
        screen.className = 'screen pause-screen';
        this.pauseOverlay = screen;

        const heading = document.createElement('h2');
        heading.textContent = t('pause.title');
        screen.appendChild(heading);

        const info = document.createElement('p');
        info.className = 'pause-hint';
        info.textContent = t('pause.status', {
            stage: stageName(this.currentStage),
            time: this.formatTime(this.gameTime),
            kills: this.killCount,
        });
        screen.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'pause-actions';
        actions.appendChild(this.createPauseButton(t('pause.resume'), 'primary', () => this.resumeGame()));

        // Settings fold out in place. Routing to the Options screen would tear
        // down the game screen (and the run with it), so the same panel is
        // mounted here instead.
        const settings = createSettingsPanel(true);
        settings.hidden = !this.pauseSettingsOpen;

        const label = () => t('pause.settings') + (settings.hidden ? '' : ' ▴');
        const settingsBtn = this.createPauseButton(label(), 'ghost', () => {
            settings.hidden = !settings.hidden;
            this.pauseSettingsOpen = !settings.hidden;
            settingsBtn.textContent = label();
        });
        actions.appendChild(settingsBtn);
        actions.appendChild(settings);

        actions.appendChild(this.createPauseButton(t('pause.quit'), 'danger', () => {
            this.resumeGame();
            audio.stopMusic();
            this.state = 'MENU';
            screenManager.goto('main_menu');
        }));
        screen.appendChild(actions);

        this.uiLayer.appendChild(screen);
    }

    private resumeGame() {
        this.pauseI18nUnsub?.();
        this.pauseI18nUnsub = null;
        this.pauseOverlay?.remove();
        this.pauseOverlay = null;
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

    /** Same look and blips as the menu buttons, without the screen base class */
    private createPauseButton(text: string, variant: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = `pixel-btn pixel-btn--${variant} interactive`;
        btn.textContent = text;
        btn.addEventListener('pointerenter', () => audio.play('uiHover'));
        btn.addEventListener('click', () => {
            audio.play('uiSelect');
            onClick();
        });
        return btn;
    }

    private formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    showLevelUp() {
        this.state = 'LEVEL_UP';
        audio.play('levelup');
        audio.play('crash');

        // The panel smashes through the screen: flash, freeze, zoom, shake
        juice.flash('#ffffff', 0.6, 0.35);
        juice.addTrauma(0.6);
        juice.zoomPunch(0.8);
        juice.hitStop(0.08);
        if (this.player) {
            juice.shockwave(this.player.pos.x, this.player.pos.y, 260, '#66f7ff', 0.5, 6);
        }

        const screen = document.createElement('div');
        screen.className = 'screen level-up-screen crash-in';
        screen.appendChild(this.createImpactOverlay());

        // Heading is appended (not innerHTML) so the crack overlay survives
        const heading = document.createElement('h2');
        screen.appendChild(heading);

        // Developer Mode with Tabs
        if (this.devMode) {
            heading.textContent = t('levelup.devMode');

            // Create tabs
            const tabs = document.createElement('div');
            tabs.className = 'dev-tabs interactive';

            const tabData = [
                { id: 'powerups', label: t('levelup.tabPowerups') },
                { id: 'weapons', label: t('levelup.tabWeapons') },
                { id: 'evolved', label: t('levelup.tabEvolved') }
            ];

            tabData.forEach((tab, index) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = 'dev-tab' + (index === 0 ? ' active' : '');
                tabBtn.textContent = tab.label;
                tabBtn.dataset.tab = tab.id;
                tabBtn.onclick = () => this.switchDevTab(tab.id, screen);
                tabs.appendChild(tabBtn);
            });

            screen.appendChild(tabs);

            // Create grid container
            const grid = document.createElement('div');
            grid.className = 'dev-upgrade-grid';
            grid.id = 'dev-grid';
            screen.appendChild(grid);

            this.uiLayer.appendChild(screen);

            // Populate initial tab (powerups)
            this.switchDevTab('powerups', screen);
            return;
        }

        // Normal mode: weighted pool biased toward owned weapons (see UpgradePool)
        const isLucky = Math.random() < 0.1;
        const upgradeCount = isLucky ? 6 : 3;

        heading.textContent = isLucky ? t('levelup.lucky') : t('levelup.title');
        if (isLucky) heading.classList.add('lucky');

        const grid = document.createElement('div');
        grid.className = isLucky ? 'upgrade-grid-6' : 'upgrade-grid';
        screen.appendChild(grid);

        // One free reroll every level-up, plus one per Spare Cartridge stack.
        //
        // Three random cards with no way to say "not these" is a lottery, not a
        // decision — and the pool already guarantees an owned weapon in every
        // draw, so a reroll cannot lock you out of your evolution.
        let rerollsLeft = 1 + (this.player?.stats.reroll ?? 0);

        const reroll = document.createElement('button');
        reroll.className = 'reroll-btn interactive';
        const renderReroll = () => {
            reroll.disabled = rerollsLeft <= 0;
            reroll.innerHTML = `<span class="reroll-icon">⟳</span><span class="reroll-count">${rerollsLeft}</span>`;
            reroll.title = t('levelup.reroll');
        };
        reroll.onclick = () => {
            if (rerollsLeft <= 0) return;
            rerollsLeft--;
            audio.play('uiSelect');
            renderReroll();
            this.fillUpgradeGrid(grid, screen, upgradeCount);
        };
        reroll.addEventListener('pointerenter', () => audio.play('uiHover'));
        renderReroll();

        this.fillUpgradeGrid(grid, screen, upgradeCount);
        // Six cards wrap into two rows of three, so vertical steps move by 3
        this.attachUpgradeKeys(isLucky ? 3 : upgradeCount);
        screen.appendChild(reroll);
        this.uiLayer.appendChild(screen);
    }

    /** (Re)draw the level-up offers into `grid` */
    private fillUpgradeGrid(grid: HTMLElement, screen: HTMLElement, count: number) {
        grid.innerHTML = '';
        const cards: HTMLElement[] = [];

        const options = buildUpgradeOptions({
            weaponLevels: this.weaponLevels,
            powerupLevels: this.powerupLevels,
            classId: this.player?.classId,
            count,
        });

        options.forEach((opt, index) => {
            const card = document.createElement('div');
            card.className = 'upgrade-card interactive';
            // Staggered slam-in: each card lands just after the panel impact
            card.style.animationDelay = `${(0.12 + index * 0.06).toFixed(2)}s`;
            card.addEventListener('pointerenter', () => audio.play('uiHover'));
            card.addEventListener('click', () => audio.play('uiSelect'), { capture: true });

            if (opt.type === 'weapon') {
                const weaponData = opt.data;
                const currentLevel = this.weaponLevels.get(weaponData.id) || 0;
                const canEvolve = currentLevel === 5;
                const newLevel = currentLevel + 1;

                if (canEvolve) {
                    card.classList.add('evolution-ready');
                }

                const emoji = canEvolve ? weaponData.evolution.emoji : weaponData.emoji;
                const name = canEvolve ? weaponEvoName(weaponData) : weaponName(weaponData);
                const desc = canEvolve ? weaponEvoDesc(weaponData) : weaponDesc(weaponData);
                const levelText = canEvolve
                    ? t('levelup.evolve')
                    : (currentLevel > 0 ? t('levelup.level', { from: currentLevel, to: newLevel }) : t('common.new'));

                card.innerHTML = `
                <div style="font-size: 3em">${emoji}</div>
                <h3>${name}</h3>
                <div class="level-indicator">${levelText}</div>
                <p>${desc}</p>
                ${this.weaponPreview(weaponData, currentLevel, canEvolve)}
              `;

                this.bindPick(card, screen, () => this.addWeapon(weaponData.id));
            } else {
                const powerup = opt.data;
                const stack = this.powerupLevels.get(powerup.name) ?? 0;
                const value = getPowerupValue(powerup.value, stack, powerup.stackGrowth);
                const bonus = formatPowerupBonus(powerup.type, value);
                const stackText = stack > 0
                    ? t('levelup.level', { from: stack, to: stack + 1 })
                    : t('common.new');
                card.innerHTML = `
                <div style="font-size: 3em">${powerup.emoji}</div>
                <h3>${powerupName(powerup)}</h3>
                <div class="level-indicator">${stackText} · ${bonus}</div>
                <p>${powerupDesc(powerup)}</p>
                ${this.powerupPreview(powerup, value)}
              `;
                this.bindPick(card, screen, () => this.applyPowerup(powerup));
            }

            card.addEventListener('pointerenter', () => this.focusCard(cards.indexOf(card)));
            cards.push(card);
            grid.appendChild(card);
        });

        // Start on the middle card: the reroll button is directly below it, and
        // a centred cursor is one keypress from either edge
        this.upgradeCards = cards;
        this.focusCard(Math.floor(cards.length / 2));
    }

    /**
     * Committing a pick.
     *
     * The upgrade used to apply on the same frame as the click, so a level-up
     * was a card vanishing — nothing confirmed that *this* one was the one you
     * took. A brief flash on the chosen card plus a chime gives the choice a
     * moment of weight, and the world is frozen during LEVEL_UP so the delay
     * costs nothing.
     */
    private bindPick(card: HTMLElement, screen: HTMLElement, apply: () => void) {
        let taken = false;
        card.onclick = () => {
            if (taken) return;
            taken = true;
            card.classList.add('upgrade-card--picked');
            audio.play('evolve');
            juice.flash('#ffffff', 0.18, 0.16);

            setTimeout(() => {
                this.detachUpgradeKeys();
                apply();
                screen.remove();
                this.state = 'PLAYING';
            }, 160);
        };
    }

    /** Move the keyboard cursor; clamped, never wraps */
    private focusCard(index: number) {
        if (this.upgradeCards.length === 0) return;
        const clamped = Math.max(0, Math.min(this.upgradeCards.length - 1, index));
        if (clamped === this.focusedCard && this.upgradeCards[clamped].classList.contains('upgrade-card--focused')) return;

        this.upgradeCards.forEach(c => c.classList.remove('upgrade-card--focused'));
        this.upgradeCards[clamped].classList.add('upgrade-card--focused');
        this.focusedCard = clamped;
    }

    /**
     * WASD / arrows to move, space or enter to take it.
     *
     * Three cards is one row, six is two rows of three — so W/S step by the row
     * width rather than by one, which is what "up" means on a grid.
     */
    private attachUpgradeKeys(columns: number) {
        this.detachUpgradeKeys();

        const onKey = (e: KeyboardEvent) => {
            if (this.state !== 'LEVEL_UP' || this.upgradeCards.length === 0) return;

            let moved = true;
            switch (e.code) {
                case 'KeyA': case 'ArrowLeft': this.focusCard(this.focusedCard - 1); break;
                case 'KeyD': case 'ArrowRight': this.focusCard(this.focusedCard + 1); break;
                case 'KeyW': case 'ArrowUp': this.focusCard(this.focusedCard - columns); break;
                case 'KeyS': case 'ArrowDown': this.focusCard(this.focusedCard + columns); break;
                case 'Space': case 'Enter':
                    e.preventDefault();
                    this.upgradeCards[this.focusedCard]?.click();
                    return;
                default: moved = false;
            }

            if (moved) {
                e.preventDefault();
                audio.play('uiHover');
            }
        };

        window.addEventListener('keydown', onKey);
        this.upgradeKeyHandler = onKey;
    }

    private detachUpgradeKeys() {
        if (!this.upgradeKeyHandler) return;
        window.removeEventListener('keydown', this.upgradeKeyHandler);
        this.upgradeKeyHandler = null;
        this.upgradeCards = [];
    }

    /**
     * "124% → 132%" under the flavour text.
     *
     * The description says what a powerup *is*; this says what taking it does to
     * the number you already have, which is what actually decides the pick.
     */
    private powerupPreview(powerup: any, value: number): string {
        if (!this.player) return '';

        const stats = this.player.stats as Record<string, number>;
        const current = powerup.type === 'maxHp' ? this.player.maxHp : (stats[powerup.type] ?? 0);
        return `<div class="stat-preview">${formatStatPreview(powerup.type, current, current + value)}</div>`;
    }

    /** Damage before → after for a weapon card */
    private weaponPreview(weaponData: any, currentLevel: number, canEvolve: boolean): string {
        if (currentLevel === 0 || !this.player) return '';

        const weapon = this.player.weapons.find((w: any) => w.weaponId === weaponData.id);
        if (!weapon) return '';

        // Upgrades scale damage by 1.2; evolving doubles it (see Weapon.upgrade)
        const next = canEvolve ? weapon.damage * 2 : weapon.damage * 1.2;

        // Shown through `might`, because that is the number that lands. Crit and
        // adrenaline are deliberately left out: both are situational, and a
        // preview that changes with the player's current HP is noise. With
        // GLOBAL_DAMAGE gone, this is now the whole of the calculation.
        const might = this.player.stats.might;
        return `<div class="stat-preview">${t('levelup.damage')} ${Math.round(weapon.damage * might)} → ${Math.round(next * might)}</div>`;
    }

    switchDevTab(tabId: string, screen: HTMLElement) {
        // Update active tab
        const tabs = screen.querySelectorAll('.dev-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', (tab as HTMLElement).dataset.tab === tabId);
        });

        // Get grid
        const grid = document.getElementById('dev-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (tabId === 'powerups') {
            // Show all powerups
            POWERUPS.forEach(powerup => {
                const card = this.createDevCard(
                    powerup.emoji,
                    powerupName(powerup),
                    powerupDesc(powerup),
                    '',
                    () => {
                        this.applyPowerup(powerup);
                        screen.remove();
                        this.state = 'PLAYING';
                    }
                );
                grid.appendChild(card);
            });
        } else if (tabId === 'weapons') {
            // Show all base weapons
            WEAPONS.forEach(weaponData => {
                const currentLevel = this.weaponLevels.get(weaponData.id) || 0;
                const isEvolved = currentLevel >= 6;

                if (isEvolved) return; // Skip fully evolved weapons

                const canEvolve = currentLevel === 5;
                const newLevel = currentLevel + 1;
                const levelText = canEvolve
                    ? t('levelup.evolve')
                    : (currentLevel > 0 ? t('levelup.level', { from: currentLevel, to: newLevel }) : t('common.new'));

                const emoji = canEvolve ? weaponData.evolution.emoji : weaponData.emoji;
                const name = canEvolve ? weaponEvoName(weaponData) : weaponName(weaponData);
                const desc = canEvolve ? weaponEvoDesc(weaponData) : weaponDesc(weaponData);

                const card = this.createDevCard(
                    emoji,
                    name,
                    desc,
                    levelText,
                    () => {
                        this.addWeapon(weaponData.id);
                        screen.remove();
                        this.state = 'PLAYING';
                    },
                    canEvolve
                );
                grid.appendChild(card);
            });
        } else if (tabId === 'evolved') {
            // Show evolved weapons (only those not yet evolved)
            WEAPONS.forEach(weaponData => {
                const currentLevel = this.weaponLevels.get(weaponData.id) || 0;

                // Skip if weapon is already evolved
                if (currentLevel >= 6) return;

                const card = this.createDevCard(
                    weaponData.evolution.emoji,
                    weaponEvoName(weaponData),
                    weaponEvoDesc(weaponData),
                    t('levelup.instantEvolve'),
                    () => {
                        this.addEvolvedWeapon(weaponData.id);
                        screen.remove();
                        this.state = 'PLAYING';
                    },
                    true // isEvolutionReady - use evolution-ready styling
                );
                grid.appendChild(card);
            });
        }
    }

    createDevCard(
        emoji: string,
        name: string,
        description: string,
        levelText: string,
        onClick: () => void,
        isEvolutionReady: boolean = false
    ): HTMLElement {
        const card = document.createElement('div');
        card.className = 'upgrade-card interactive';

        if (isEvolutionReady) {
            card.classList.add('evolution-ready');
        }

        card.innerHTML = `
            <div style="font-size: 3em">${emoji}</div>
            <h3>${name}</h3>
            ${levelText ? `<div class="level-indicator">${levelText}</div>` : ''}
            <p>${description}</p>
        `;

        card.onclick = onClick;
        return card;
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
            projectiles: this.projectiles.length
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

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            if (p.isDead) {
                this.projectiles.splice(i, 1);
            }
        }

        // Collisions - delegated to CollisionSystem
        collisionSystem.processProjectileCollisions(this.projectiles);

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
                this.spawnXPCrystal(enemy.pos.x, enemy.pos.y, crystalValue);
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

        this.updateCrystals(dt);

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

        this.updateDamageNumbers(dt);
        this.updateParticles(dt);
        this.updateHUD();
    }

    /**
     * XP crystals never expire — clearing a pack, kiting out and coming back
     * for the drops is the loop the game is built on, and a 30s timer punished
     * exactly that.
     *
     * The cost of keeping them is bounded here rather than by deleting them:
     * a crystal off screen does not move (nothing but the magnet moves one) and
     * nobody can see it bob, so it is skipped entirely. Iterating the array is
     * a couple of thousand cheap distance checks; *drawing* is what costs.
     */
    private updateCrystals(dt: number) {
        if (!this.player) return;

        const magnet = this.player.stats.magnet;
        const halfW = this.canvas.width / 2 + CRYSTAL_ACTIVE_MARGIN;
        const halfH = this.canvas.height / 2 + CRYSTAL_ACTIVE_MARGIN;
        const px = this.player.pos.x;
        const py = this.player.pos.y;

        for (let i = this.xpCrystals.length - 1; i >= 0; i--) {
            const crystal = this.xpCrystals[i];
            if (Math.abs(crystal.pos.x - px) > halfW || Math.abs(crystal.pos.y - py) > halfH) continue;

            crystal.update(dt, this.player.pos, magnet);

            if (checkCollision(crystal, this.player)) {
                this.player.gainXp(crystal.value);
                audio.play('pickup');
                this.xpCrystals.splice(i, 1);
            }
        }

        this.crystalMergeTimer -= dt;
        if (this.crystalMergeTimer <= 0) {
            this.crystalMergeTimer = 1;
            this.consolidateCrystals();
        }
    }

    /**
     * Safety valve for a very long run: once the field is crowded, distant
     * crystals are merged cell by cell into one bigger crystal carrying the
     * combined XP. Nothing is lost, and the array cannot grow without bound.
     * Only crystals well away from the player are touched, so this never
     * rearranges anything you are looking at.
     */
    private consolidateCrystals() {
        if (!this.player || this.xpCrystals.length <= CRYSTAL_SOFT_CAP) return;

        const px = this.player.pos.x;
        const py = this.player.pos.y;
        const buckets = new Map<string, XPCrystal>();
        const kept: XPCrystal[] = [];

        for (const crystal of this.xpCrystals) {
            const dx = crystal.pos.x - px;
            const dy = crystal.pos.y - py;
            if (dx * dx + dy * dy < CRYSTAL_MERGE_DISTANCE * CRYSTAL_MERGE_DISTANCE) {
                kept.push(crystal);
                continue;
            }

            const key = `${Math.floor(crystal.pos.x / CRYSTAL_MERGE_CELL)}:${Math.floor(crystal.pos.y / CRYSTAL_MERGE_CELL)}`;
            const existing = buckets.get(key);
            if (existing) {
                existing.setValue(existing.value + crystal.value);
            } else {
                buckets.set(key, crystal);
                kept.push(crystal);
            }
        }

        this.xpCrystals = kept;
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
     * The three "what happened" numbers, as opposed to the "how far did you
     * get" ones above them. These are the parts of a run people retell.
     */
    private createHighlights(): HTMLElement {
        const stats = this.runStats.stats;
        const box = document.createElement('div');
        box.className = 'result-highlights';

        const rows: string[] = [];

        if (stats.bestHit > 0) {
            const weapon = WEAPONS.find(w => w.id === stats.bestHitWeaponId);
            const evolved = weapon && (this.weaponLevels.get(weapon.id) ?? 0) >= 6;
            const via = weapon
                ? `${evolved ? weapon.evolution.emoji : weapon.emoji} ${evolved ? weaponEvoName(weapon) : weaponName(weapon)}`
                : '';
            rows.push(`
                <div class="highlight">
                    <span>${stats.bestHitCrit ? t('result.bestCrit') : t('result.bestHit')}</span>
                    <strong>${formatScore(Math.round(stats.bestHit))}</strong>
                    <em>${via}</em>
                </div>`);
        }

        rows.push(`
            <div class="highlight">
                <span>${t('result.untouched')}</span>
                <strong>${this.formatTime(stats.longestUntouched)}</strong>
            </div>`);

        if (stats.bestMultikill > 1) {
            rows.push(`
                <div class="highlight">
                    <span>${t('result.multikill')}</span>
                    <strong>×${stats.bestMultikill}</strong>
                </div>`);
        }

        rows.push(`
            <div class="highlight">
                <span>${t('result.totalDamage')}</span>
                <strong>${formatScore(Math.round(stats.totalDamage))}</strong>
            </div>`);

        // Shown even at zero, on purpose: "you healed nothing all run" is a
        // fact about the build, and one the player can act on next time
        rows.push(`
            <div class="highlight">
                <span>${t('result.healed')}</span>
                <strong>${formatScore(Math.round(stats.totalHealed))}</strong>
            </div>`);

        box.innerHTML = rows.join('');
        return box;
    }

    /**
     * What you actually built, spelled out — the same icons the in-run panel
     * shows, so the end screen answers "what was that run" rather than making
     * you remember. Deliberately no per-weapon damage: ranking your own weapons
     * would turn build variety into a solved problem.
     */
    private createBuildSummary(): HTMLElement {
        const box = document.createElement('div');
        box.className = 'result-build';

        const slots: string[] = [];
        for (const [id, level] of this.weaponLevels) {
            const weapon = WEAPONS.find(w => w.id === id);
            if (!weapon) continue;
            const evolved = level >= 6;
            slots.push(`
                <div class="build-slot${evolved ? ' build-slot--evolved' : ''}" title="${evolved ? weaponEvoName(weapon) : weaponName(weapon)}">
                    <span class="build-icon">${evolved ? weapon.evolution.emoji : weapon.emoji}</span>
                    <span class="build-badge">${evolved ? '★' : level}</span>
                </div>`);
        }
        for (const [name, stacks] of this.powerupLevels) {
            const powerup = POWERUPS.find(p => p.name === name);
            if (!powerup) continue;
            slots.push(`
                <div class="build-slot" title="${powerupName(powerup)}">
                    <span class="build-icon">${powerup.emoji}</span>
                    <span class="build-badge">${stacks}</span>
                </div>`);
        }

        box.innerHTML = `<span class="result-build-label">${t('result.build')}</span>
            <div class="result-build-row">${slots.join('')}</div>`;
        return box;
    }

    /** Shared end-of-run panel for both defeat and victory */
    private showRunSummary(opts: { title: string; subtitle: string; variant: 'defeat' | 'victory' }) {
        const mins = Math.floor(this.gameTime / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.gameTime % 60).toString().padStart(2, '0');

        const screen = document.createElement('div');
        screen.className = `screen result-screen result-screen--${opts.variant}`;

        const title = document.createElement('h1');
        title.textContent = opts.title;
        screen.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'result-subtitle';
        subtitle.textContent = opts.subtitle;
        screen.appendChild(subtitle);

        // Score is the headline: it is the only number that makes two runs
        // comparable, so it gets its own panel above the breakdown
        achievements.check(this.runSnapshot());
        const { score, rank } = this.submitRunScore(opts.variant === 'victory');
        const scoreBox = document.createElement('div');
        scoreBox.className = 'result-score';
        scoreBox.innerHTML = `
            <span>${t('result.score')}</span>
            <strong>${formatScore(score)}</strong>
            ${rank > 0 ? `<em class="result-rank">${t('result.newRecord', { rank })}</em>` : ''}
        `;
        screen.appendChild(scoreBox);

        const stats = document.createElement('div');
        stats.className = 'result-stats';
        stats.innerHTML = `
            <div class="result-stat"><span>${t('result.time')}</span><strong>${mins}:${secs}</strong></div>
            <div class="result-stat"><span>${t('result.kills')}</span><strong>${this.killCount}</strong></div>
            <div class="result-stat"><span>${t('result.level')}</span><strong>${this.player?.level ?? 1}</strong></div>
        `;
        screen.appendChild(stats);
        screen.appendChild(this.createHighlights());
        screen.appendChild(this.createBuildSummary());

        const buttons = document.createElement('div');
        buttons.className = 'menu-buttons menu-buttons--row';

        const again = document.createElement('button');
        again.className = 'pixel-btn pixel-btn--primary interactive';
        again.textContent = t('result.again');
        again.addEventListener('pointerenter', () => audio.play('uiHover'));
        again.onclick = () => {
            audio.play('uiSelect');
            screenManager.goto('class_selection');
        };

        const menu = document.createElement('button');
        menu.className = 'pixel-btn interactive';
        menu.textContent = t('result.menu');
        menu.addEventListener('pointerenter', () => audio.play('uiHover'));
        menu.onclick = () => {
            audio.play('uiBack');
            screenManager.goto('main_menu');
        };

        buttons.appendChild(again);
        buttons.appendChild(menu);
        screen.appendChild(buttons);

        const credit = document.createElement('div');
        credit.className = 'menu-credit';
        credit.textContent = AUTHOR_CREDIT;
        screen.appendChild(credit);

        this.uiLayer.appendChild(screen);
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
        this.showRunSummary({
            title: t('result.gameOver'),
            subtitle: t('result.defeatSubtitle', { stage: stageName(this.currentStage) }),
            variant: 'defeat',
        });
    }

    showVictory() {
        audio.stopMusic();
        audio.play('victory');
        juice.flash('#ffffff', 0.6, 0.9);
        juice.zoomPunch(0.8);
        juice.slowMo(0.3, 1);
        this.showRunSummary({
            title: t('result.victory'),
            subtitle: t('result.victorySubtitle', { stage: stageName(this.currentStage) }),
            variant: 'victory',
        });
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

    spawnDamageNumber(pos: Vector2, amount: number, isCrit: boolean = false) {
        // Cap the on-screen count — late-game AoE can produce hundreds per second
        if (this.damageNumbers.length > 90) this.damageNumbers.shift();

        const life = isCrit ? 0.8 : 0.55;
        this.damageNumbers.push({
            // Wide horizontal jitter so simultaneous hits don't stack into an
            // unreadable pile of digits
            x: pos.x + (Math.random() - 0.5) * 28,
            y: pos.y,
            // Arc upward and outward so overlapping hits stay readable
            vx: (Math.random() - 0.5) * 60,
            vy: isCrit ? -160 : -110,
            text: Math.floor(amount).toString(),
            life,
            maxLife: life,
            isCrit,
        });

        if (!isCrit) {
            audio.play('hit');
        } else {
            audio.play('crit');
            // Micro freeze on crits, at most a few times a second
            const now = performance.now() / 1000;
            if (now - this.lastCritStop > 0.35) {
                this.lastCritStop = now;
                juice.hitStop(0.035);
                juice.addTrauma(0.06);
            }
        }
    }

    private updateDamageNumbers(dt: number) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dn = this.damageNumbers[i];
            dn.life -= dt;
            if (dn.life <= 0) {
                this.damageNumbers.splice(i, 1);
                continue;
            }
            dn.x += dn.vx * dt;
            dn.y += dn.vy * dt;
            dn.vy += 260 * dt;  // gravity — the numbers arc and settle
            dn.vx *= 0.94;
        }
    }

    spawnXPCrystal(x: number, y: number, value: number) {
        this.xpCrystals.push(new XPCrystal(x, y, value));
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

        this.projectiles.forEach(p => {
            if (p instanceof Zone) p.draw(ctx, camera);
        });

        // Draw XP crystals
        // Same screen-bounds cull as the update: drawing is the expensive part,
        // and a run can leave thousands of crystals lying around the arena
        const cullW = this.canvas.width + CRYSTAL_ACTIVE_MARGIN;
        const cullH = this.canvas.height + CRYSTAL_ACTIVE_MARGIN;
        for (const crystal of this.xpCrystals) {
            const sx = crystal.pos.x - camera.x;
            const sy = crystal.pos.y - camera.y;
            if (sx < -CRYSTAL_ACTIVE_MARGIN || sy < -CRYSTAL_ACTIVE_MARGIN || sx > cullW || sy > cullH) continue;
            crystal.draw(ctx, camera);
        }
        this.repairCells.forEach(c => c.draw(ctx, camera));

        this.enemies.forEach(e => e.draw(ctx, camera));

        this.player?.draw(ctx, camera);

        this.projectiles.forEach(p => {
            if (p instanceof Projectile) p.draw(ctx, camera);
        });

        // Draw particles
        particles.draw(ctx, camera);

        // Shockwave rings (explosions, boss deaths)
        juice.drawWorld(ctx, camera);

        this.drawDamageNumbers(ctx, camera);

        if (transformed) ctx.restore();

        // Stage lighting sits above the world but below the HUD and juice flashes
        stageBackdrop.drawLighting(ctx, this.canvas.width, this.canvas.height);
        arenaEvents.drawBanner(ctx, this.canvas.width, this.canvas.height);

        // Draw debug overlay (FPS, stats)
        debugOverlay.draw(ctx);
    }

    /** Pixel-font damage numbers: crits pop bigger, brighter and outlined */
    private drawDamageNumbers(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (this.damageNumbers.length === 0) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const dn of this.damageNumbers) {
            const t = 1 - dn.life / dn.maxLife;
            // Punch-in scale for the first 15% of the lifetime
            const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : 1.15 - (t - 0.15) * 0.15;
            const base = dn.isCrit ? 3.4 : 2.2;
            const scale = Math.max(1, Math.round(base * pop));

            ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
            drawPixelText(ctx, dn.text, dn.x - camera.x, dn.y - camera.y, {
                scale,
                align: 'center',
                spacing: 1,
                shadow: 1,
                color: dn.isCrit ? '#ffe14d' : '#ffffff',
                outline: dn.isCrit ? '#ff4400' : undefined,
            });
        }
        ctx.restore();
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
