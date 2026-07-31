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
import { STAGES, type StageConfig } from './data/StageData';
import { audio } from './core/AudioSystem';

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
    damageNumbers: { x: number, y: number, text: string, life: number, isCrit?: boolean }[] = [];

    camera: Vector2 = { x: 0, y: 0 };

    // Screen shake state
    private shakeTime: number = 0;
    private shakeDuration: number = 0;
    private shakeMagnitude: number = 0;

    backgroundTheme: string = 'Asteroid Fields';
    private backgroundPattern: CanvasPattern | null = null;
    private backgroundPatternTheme: string = '';

    waveTimer: number = 0;
    gameTime: number = 0;

    uiLayer: HTMLElement;

    // Track weapon levels: weaponId -> level
    weaponLevels: Map<string, number> = new Map();

    devMode: boolean = false;
    killCount: number = 0;

    currentStage: StageConfig = STAGES[0];
    private finalBoss: Enemy | null = null;
    private finalBossSpawned: boolean = false;



    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.uiLayer = document.getElementById('ui-layer')!;

        // Connect DamageSystem to damage number display
        damageSystem.setDamageNumberCallback((pos, amount, isCrit) => {
            this.spawnDamageNumber(pos, amount, isCrit);
        });

        // Note: showClassSelection is now handled by ScreenManager
    }

    showClassSelection() {
        this.uiLayer.innerHTML = '';
        const screen = document.createElement('div');
        screen.className = 'screen';

        const title = document.createElement('h1');
        title.textContent = 'COSMOS SURVIVORS';
        screen.appendChild(title);

        // Dev Mode Checkbox
        const devModeContainer = document.createElement('div');
        devModeContainer.className = 'dev-mode-container interactive';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'dev-mode-checkbox';
        checkbox.className = 'dev-mode-checkbox';
        checkbox.checked = this.devMode;

        const label = document.createElement('label');
        label.htmlFor = 'dev-mode-checkbox';
        label.className = 'dev-mode-label';
        label.textContent = '🛠️ Developer Mode (Weapons Only, 6 Options)';

        // Toggle handler
        const toggle = () => {
            this.devMode = !this.devMode;
            checkbox.checked = this.devMode;
        };

        checkbox.onclick = toggle;
        label.onclick = toggle;

        devModeContainer.appendChild(checkbox);
        devModeContainer.appendChild(label);
        screen.appendChild(devModeContainer);

        const grid = document.createElement('div');
        grid.className = 'class-grid';

        CLASSES.forEach((cls, index) => {
            const weaponData = WEAPONS.find(w => w.id === cls.weaponId);
            const weaponName = weaponData ? weaponData.name : 'Unknown';
            const weaponEmoji = weaponData ? weaponData.emoji : '❓';

            const card = document.createElement('div');
            card.className = 'class-card interactive';
            card.innerHTML = `
        <div class="class-icon">${cls.emoji}</div>
        <div class="class-name">${cls.name}</div>
        <div class="class-bonus">❤️ ${cls.hp} HP</div>
        <div class="class-bonus">${weaponEmoji} ${weaponName}</div>
        <div class="class-bonus">${cls.bonus}</div>
      `;
            card.onclick = () => this.startGame(index);
            grid.appendChild(card);
        });

        screen.appendChild(grid);
        this.uiLayer.appendChild(screen);
    }

    startGame(classIndex: number, stageIndex: number = 0) {
        this.currentStage = STAGES[stageIndex] ?? STAGES[0];
        this.backgroundTheme = this.currentStage.theme;
        this.backgroundPattern = null;
        this.finalBoss = null;
        this.finalBossSpawned = false;

        const cls = CLASSES[classIndex];
        this.player = new Player(0, 0);

        // Apply Class Stats
        this.player.className = cls.name;
        this.player.classEmoji = cls.emoji;

        // Set HP from class
        this.player.hp = cls.hp;
        this.player.maxHp = cls.hp;

        Object.assign(this.player.stats, cls.stats);

        this.player.onLevelUp = () => this.showLevelUp();

        // Add starting weapon
        this.addWeapon(cls.weaponId);

        this.enemies = [];
        this.projectiles = [];
        this.xpCrystals = [];
        this.damageNumbers = [];
        this.killCount = 0;
        this.gameTime = 0;
        difficultyDirector.reset();
        this.camera.x = this.player.pos.x - this.canvas.width / 2;
        this.camera.y = this.player.pos.y - this.canvas.height / 2;
        this.shakeTime = 0;
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

    spawnEntity(entity: Entity) {
        if (entity instanceof Projectile || entity instanceof Zone) {
            this.projectiles.push(entity as any);
            audio.play('shoot');
        }
    }

    showLevelUp() {
        this.state = 'LEVEL_UP';
        audio.play('levelup');

        const screen = document.createElement('div');
        screen.className = 'screen level-up-screen';

        // Developer Mode with Tabs
        if (this.devMode) {
            screen.innerHTML = `<h2>🛠️ DEVELOPER MODE 🛠️</h2>`;

            // Create tabs
            const tabs = document.createElement('div');
            tabs.className = 'dev-tabs interactive';

            const tabData = [
                { id: 'powerups', label: '⚡ Powerups' },
                { id: 'weapons', label: '⚔️ Weapons' },
                { id: 'evolved', label: '🌟 Evolved' }
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

        // Normal mode (unchanged)
        const isLucky = Math.random() < 0.1;
        const upgradeCount = isLucky ? 6 : 3;

        screen.innerHTML = `<h2>${isLucky ? '✨ LUCKY LEVEL UP! ✨' : 'LEVEL UP!'}</h2>`;

        const grid = document.createElement('div');
        grid.className = isLucky ? 'upgrade-grid-6' : 'upgrade-grid';

        // Create pool of all options
        const allOptions: any[] = [];

        // Add powerups
        POWERUPS.forEach(p => {
            allOptions.push({ type: 'powerup', data: p });
        });

        // Add weapons (excluding evolved weapons)
        WEAPONS.forEach(w => {
            const weaponLevel = this.weaponLevels.get(w.id) || 0;
            const isEvolved = weaponLevel >= 6;
            if (!isEvolved) {
                allOptions.push({ type: 'weapon', data: w });
            }
        });

        // Pick random unique options (no duplicates)
        const options = [];
        const usedIndices = new Set<number>();

        for (let i = 0; i < upgradeCount && usedIndices.size < allOptions.length; i++) {
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * allOptions.length);
            } while (usedIndices.has(randomIndex));

            usedIndices.add(randomIndex);
            options.push(allOptions[randomIndex]);
        }

        options.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'upgrade-card interactive';

            if (opt.type === 'weapon') {
                const weaponData = opt.data;
                const currentLevel = this.weaponLevels.get(weaponData.id) || 0;
                const canEvolve = currentLevel === 5;
                const newLevel = currentLevel + 1;

                if (canEvolve) {
                    card.classList.add('evolution-ready');
                }

                const emoji = canEvolve ? weaponData.evolution.emoji : weaponData.emoji;
                const name = canEvolve ? weaponData.evolution.name : weaponData.name;
                const desc = canEvolve ? weaponData.evolution.description : weaponData.description;
                const levelText = canEvolve ? 'EVOLVE!' : (currentLevel > 0 ? `lv ${currentLevel} → ${newLevel}` : 'NEW');

                card.innerHTML = `
                <div style="font-size: 3em">${emoji}</div>
                <h3>${name}</h3>
                <div class="level-indicator">${levelText}</div>
                <p>${desc}</p>
              `;

                card.onclick = () => {
                    this.addWeapon(weaponData.id);
                    screen.remove();
                    this.state = 'PLAYING';
                };
            } else {
                const powerup = opt.data;
                card.innerHTML = `
                <div style="font-size: 3em">${powerup.emoji}</div>
                <h3>${powerup.name}</h3>
                <p>${powerup.description}</p>
              `;
                card.onclick = () => {
                    this.applyPowerup(powerup);
                    screen.remove();
                    this.state = 'PLAYING';
                };
            }

            grid.appendChild(card);
        });

        screen.appendChild(grid);
        this.uiLayer.appendChild(screen);
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
                    powerup.name,
                    powerup.description,
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
                const levelText = canEvolve ? 'EVOLVE!' : (currentLevel > 0 ? `lv ${currentLevel} → ${newLevel}` : 'NEW');

                const emoji = canEvolve ? weaponData.evolution.emoji : weaponData.emoji;
                const name = canEvolve ? weaponData.evolution.name : weaponData.name;
                const desc = canEvolve ? weaponData.evolution.description : weaponData.description;

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
                    weaponData.evolution.name,
                    weaponData.evolution.description,
                    '⚡ INSTANT EVOLVE',
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

        // Apply stat boost
        if (opt.type in this.player.stats) {
            (this.player.stats as any)[opt.type] += opt.value;
        }

        // Special handling for maxHp
        if (opt.type === 'maxHp') {
            this.player.maxHp += opt.value;
            this.player.hp += opt.value;
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
        this.waveTimer += dt;

        // Adaptive spawning — DifficultyDirector decides how many and how strong
        difficultyDirector.update(dt, {
            gameTime: this.gameTime,
            playerLevel: this.player.level,
            playerHpRatio: this.player.hp / this.player.maxHp,
            enemyCount: this.enemies.length,
            killCount: this.killCount,
        });

        for (const event of difficultyDirector.consumeEvents()) {
            if (event.type === 'burst') {
                // Ring of enemies converging on the player
                for (let i = 0; i < event.count; i++) {
                    this.spawnEnemy({ angle: (i / event.count) * Math.PI * 2 });
                }
            } else if (event.type === 'miniboss') {
                this.spawnEnemy({ boss: true });
                audio.play('bossSpawn');
            }
        }

        const spawnCount = difficultyDirector.takeSpawnCount(this.enemies.length);
        for (let i = 0; i < spawnCount; i++) {
            this.spawnEnemy();
        }

        // Stage final boss: appears once the survival timer runs out
        if (!this.finalBossSpawned && this.gameTime >= this.currentStage.duration) {
            this.finalBossSpawned = true;
            this.spawnEnemy({ boss: true, final: true });
            this.shake(10, 0.6);
            audio.play('bossSpawn');
        }

        this.player.update(dt);
        this.player.weapons.forEach(w => w.update(dt));

        // Reset enemy stats and forces before updates/collisions
        this.enemies.forEach(e => {
            e.speedMultiplier = 1;
            e.resetForces();
        });

        // === ENEMY SEPARATION USING SPATIAL HASH ===
        // 1. Build spatial hash grid
        levelSpatialHash.clear();
        levelSpatialHash.insertAll(this.enemies);

        // 2. Calculate separation forces for each enemy
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

        // Update enemies (Move) AFTER collisions have potentially applied slows
        this.enemies.forEach(e => e.update(dt, this.player!.pos));

        // === PLAYER-ENEMY COLLISION WITH KNOCKBACK ===
        const hpBeforeContact = this.player.hp;
        for (const e of this.enemies) {
            if (checkCollision(e, this.player)) {
                // Deal damage to player
                this.player.takeDamage(e.damage * dt);

                // Calculate direction from enemy to player
                const dx = this.player.pos.x - e.pos.x;
                const dy = this.player.pos.y - e.pos.y;
                const dist = distance(this.player.pos, e.pos);

                if (dist > 0.001) {
                    const nx = dx / dist;
                    const ny = dy / dist;

                    // Knockback force (player gets pushed away, enemy gets pushed back)
                    const knockbackForce = 150;
                    this.player.applyKnockback(nx, ny, knockbackForce);
                    e.applyKnockback(-nx, -ny, knockbackForce * 0.5); // Enemy pushed back less
                }
            }
        }
        if (this.player.hp < hpBeforeContact) {
            this.shake(4, 0.2);
            audio.play('hurt');
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].isDead) {
                const enemy = this.enemies[i];
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
                    this.shake(8, 0.4);
                }
                // Drop XP crystals instead of giving XP directly
                const crystalValue = enemy.xpValue;
                this.spawnXPCrystal(enemy.pos.x, enemy.pos.y, crystalValue);
                this.enemies.splice(i, 1);
                this.killCount++;
            }
        }

        // Update XP crystals
        for (let i = this.xpCrystals.length - 1; i >= 0; i--) {
            const crystal = this.xpCrystals[i];
            crystal.update(dt, this.player.pos, this.player.stats.magnet);

            // Check collision with player
            if (checkCollision(crystal, this.player)) {
                // Give XP
                this.player.gainXp(crystal.value);
                audio.play('pickup');
                this.xpCrystals.splice(i, 1);
            } else if (crystal.isDead) {
                this.xpCrystals.splice(i, 1);
            }
        }

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

        if (this.shakeTime > 0) this.shakeTime -= dt;

        this.updateParticles(dt);
        this.updateHUD();
    }

    showGameOver() {
        audio.stopMusic();
        audio.play('gameOver');
        const screen = document.createElement('div');
        screen.className = 'screen';
        screen.innerHTML = `
        <h1>GAME OVER</h1>
        <h2>${this.currentStage.name} — Time: ${Math.floor(this.gameTime)}s — 💀 ${this.killCount}</h2>
        <button class="interactive" style="padding: 20px; font-size: 20px; cursor: pointer;" onclick="location.reload()">RESTART</button>
      `;
        this.uiLayer.appendChild(screen);
    }

    showVictory() {
        audio.stopMusic();
        audio.play('victory');
        const screen = document.createElement('div');
        screen.className = 'screen';
        screen.innerHTML = `
        <h1>🏆 VICTORY!</h1>
        <h2>${this.currentStage.name} cleared — Time: ${Math.floor(this.gameTime)}s — 💀 ${this.killCount}</h2>
        <button class="interactive" style="padding: 20px; font-size: 20px; cursor: pointer;" onclick="location.reload()">PLAY AGAIN</button>
      `;
        this.uiLayer.appendChild(screen);
    }

    spawnEnemy(options: { boss?: boolean; final?: boolean; angle?: number } = {}) {
        if (!this.player) return;
        const angle = options.angle ?? Math.random() * Math.PI * 2;
        const dist = Math.max(this.canvas.width, this.canvas.height) / 2 + 100;
        const x = this.player.pos.x + Math.cos(angle) * dist;
        const y = this.player.pos.y + Math.sin(angle) * dist;

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

        // Time + adaptive + stage scaling (HP cap removed — see DifficultyDirector)
        enemy.maxHp = enemy.maxHp * difficultyDirector.getHpMultiplier(this.gameTime) * this.currentStage.hpScale;
        enemy.hp = enemy.maxHp;
        enemy.damage *= difficultyDirector.getDamageMultiplier(this.gameTime) * this.currentStage.damageScale;

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

    /** Trigger screen shake (magnitude in px, duration in seconds) */
    shake(magnitude: number, duration: number) {
        if (magnitude >= this.shakeMagnitude || this.shakeTime <= 0) {
            this.shakeMagnitude = magnitude;
            this.shakeDuration = duration;
            this.shakeTime = duration;
        }
    }

    /** Camera with the current shake offset applied (used for rendering only) */
    private getRenderCamera(): Vector2 {
        if (this.shakeTime <= 0) return this.camera;
        const falloff = this.shakeTime / this.shakeDuration;
        const magnitude = this.shakeMagnitude * falloff;
        return {
            x: this.camera.x + (Math.random() - 0.5) * 2 * magnitude,
            y: this.camera.y + (Math.random() - 0.5) * 2 * magnitude,
        };
    }

    spawnDamageNumber(pos: Vector2, amount: number, isCrit: boolean = false) {
        this.damageNumbers.push({
            x: pos.x,
            y: pos.y,
            text: Math.floor(amount).toString() + (isCrit ? '!' : ''),
            life: 0.5,
            isCrit: isCrit
        });
    }

    spawnXPCrystal(x: number, y: number, value: number) {
        this.xpCrystals.push(new XPCrystal(x, y, value));
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.state !== 'PLAYING' && this.state !== 'LEVEL_UP') return;

        // Reset canvas state at the start of each frame
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        const camera = this.getRenderCamera();

        this.drawBackground(ctx, camera);

        this.projectiles.forEach(p => {
            if (p instanceof Zone) p.draw(ctx, camera);
        });

        // Draw XP crystals
        this.xpCrystals.forEach(c => c.draw(ctx, camera));

        this.enemies.forEach(e => e.draw(ctx, camera));

        this.player?.draw(ctx, camera);

        this.projectiles.forEach(p => {
            if (p instanceof Projectile) p.draw(ctx, camera);
        });

        // Draw particles
        particles.draw(ctx, camera);

        ctx.font = '20px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        this.damageNumbers.forEach((dn: any, i) => {
            const screenX = dn.x - camera.x;
            const screenY = dn.y - camera.y - (0.5 - dn.life) * 50;

            ctx.save();
            if (dn.isCrit) {
                ctx.fillStyle = '#ffff00'; // Yellow
                ctx.font = 'bold 30px Arial';
                ctx.shadowColor = 'orange';
                ctx.shadowBlur = 5;
            } else {
                ctx.fillStyle = 'white';
                ctx.font = '20px Arial';
                ctx.shadowBlur = 0;
            }

            ctx.fillText(dn.text, screenX, screenY);
            ctx.restore();

            dn.life -= 0.016;
            if (dn.life <= 0) this.damageNumbers.splice(i, 1);
        });

        // Draw debug overlay (FPS, stats)
        debugOverlay.draw(ctx);
    }

    drawBackground(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (!this.backgroundPattern || this.backgroundPatternTheme !== this.backgroundTheme) {
            const tile = sprites.getBackgroundTile(this.backgroundTheme);
            this.backgroundPattern = ctx.createPattern(tile, 'repeat');
            this.backgroundPatternTheme = this.backgroundTheme;
        }
        if (!this.backgroundPattern) return;

        ctx.save();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;

        // Anchor the pattern to world space so it scrolls with the camera
        ctx.translate(-camera.x, -camera.y);
        ctx.fillStyle = this.backgroundPattern;
        ctx.fillRect(camera.x, camera.y, this.canvas.width, this.canvas.height);
        ctx.restore();
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
