import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { XPCrystal } from './entities/XPCrystal';
import { Entity } from './Entity';
import { CLASSES, POWERUPS, ENEMIES, WEAPONS } from './data/GameData';
import { checkCollision, type Vector2, distance } from './core/Utils';
import { Projectile, Zone, BouncingProjectile } from './weapons/WeaponTypes';

type GameState = 'MENU' | 'PLAYING' | 'LEVEL_UP' | 'GAME_OVER';

export class GameManager {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    state: GameState = 'MENU';

    player: Player | null = null;
    enemies: Enemy[] = [];
    projectiles: (Projectile | Zone)[] = [];
    xpCrystals: XPCrystal[] = [];
    damageNumbers: { x: number, y: number, text: string, life: number }[] = [];

    camera: Vector2 = { x: 0, y: 0 };

    waveTimer: number = 0;
    gameTime: number = 0;

    uiLayer: HTMLElement;

    // Track weapon levels: weaponId -> level
    weaponLevels: Map<string, number> = new Map();

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.uiLayer = document.getElementById('ui-layer')!;

        this.showClassSelection();
    }

    showClassSelection() {
        this.uiLayer.innerHTML = '';
        const screen = document.createElement('div');
        screen.className = 'screen';

        const title = document.createElement('h1');
        title.textContent = 'COSMOS SURVIVORS';
        screen.appendChild(title);

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

    startGame(classIndex: number) {
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
        this.gameTime = 0;
        this.state = 'PLAYING';

        this.uiLayer.innerHTML = '';
        this.createHUD();
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
            weapon.onDamage = (pos: Vector2, amount: number) => this.spawnDamageNumber(pos, amount);
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

        // Mark as evolved
        existingWeapon.evolved = true;
        existingWeapon.name = weaponData.evolution.name;
        existingWeapon.emoji = weaponData.evolution.emoji;

        // Boost stats significantly
        existingWeapon.damage *= 3;
        existingWeapon.area *= 1.5;
        existingWeapon.baseCooldown *= 0.5;

        this.weaponLevels.set(weaponId, 6);
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
      <div class="stats" style="position:absolute; top: 60px; left: 50%; transform: translateX(-50%); display: none; background: rgba(255, 215, 0, 0.3); padding: 10px 20px; border: 2px solid gold; border-radius: 10px; font-size: 20px; animation: pulse 0.5s infinite;" id="power-boost-indicator">⭐ POWER BOOST x10 ⭐</div>
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

        // Power boost indicator
        const powerBoostIndicator = document.getElementById('power-boost-indicator');
        if (powerBoostIndicator) {
            if (this.player.weaponSpeedBoostTimer > 0) {
                powerBoostIndicator.style.display = 'block';
                powerBoostIndicator.textContent = `⭐ POWER BOOST x10 (${Math.ceil(this.player.weaponSpeedBoostTimer)}s) ⭐`;
            } else {
                powerBoostIndicator.style.display = 'none';
            }
        }
    }

    spawnEntity(entity: Entity) {
        if (entity instanceof Projectile || entity instanceof Zone) {
            this.projectiles.push(entity as any);
        }
    }

    showLevelUp() {
        this.state = 'LEVEL_UP';

        // 10% chance for lucky level-up
        const isLucky = Math.random() < 0.1;
        const upgradeCount = isLucky ? 6 : 3;

        const screen = document.createElement('div');
        screen.className = 'screen level-up-screen';
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
        if (this.state !== 'PLAYING') return;
        if (!this.player) return;

        this.gameTime += dt;
        this.waveTimer += dt;

        // Spawning Logic - max 400 enemies on screen
        if (this.enemies.length < Math.min(400, 30 + this.gameTime / 5)) {
            if (Math.random() < 0.05 + (this.gameTime / 1000)) {
                this.spawnEnemy();
            }
        }

        this.player.update(dt);
        this.player.weapons.forEach(w => w.update(dt, this.enemies));

        // Reset enemy stats before updates/collisions
        this.enemies.forEach(e => {
            e.speedMultiplier = 1;
        });

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this.enemies);
            if (p.isDead) {
                this.projectiles.splice(i, 1);
            }
        }

        // Collisions
        for (const p of this.projectiles) {
            if (p instanceof Projectile && !p.canCollide) continue;

            for (const e of this.enemies) {
                if (checkCollision(p, e)) {
                    if (p instanceof BouncingProjectile) {
                        // Handle bouncing projectile
                        if (p.canHit(e)) {
                            e.takeDamage(p.damage);
                            this.spawnDamageNumber(e.pos, p.damage);
                            p.markHit(e);

                            // Try to bounce to another enemy
                            if (p.bouncesLeft > 0) {
                                let nearestEnemy: Enemy | null = null;
                                let minDist = p.maxBounceRange;

                                for (const target of this.enemies) {
                                    if (p.canHit(target)) {
                                        const d = distance(p.pos, target.pos);
                                        if (d < minDist) {
                                            minDist = d;
                                            nearestEnemy = target;
                                        }
                                    }
                                }

                                if (nearestEnemy) {
                                    p.bounce(nearestEnemy.pos);
                                } else {
                                    p.isDead = true; // No more targets
                                }
                            } else {
                                p.isDead = true; // No bounces left
                            }
                        }
                    } else if (p instanceof Projectile) {
                        e.takeDamage(p.damage);
                        this.spawnDamageNumber(e.pos, p.damage);
                        if (p.pierce !== undefined) {
                            p.pierce--;
                            if (p.pierce < 0) p.isDead = true;
                        }
                    } else if (p instanceof Zone) {
                        p.onOverlap(e);
                        if (p.timer >= p.interval) {
                            e.takeDamage(p.damage);
                            this.spawnDamageNumber(e.pos, p.damage);
                        }
                    }
                }
            }
            if (p instanceof Zone && p.timer >= p.interval) {
                p.timer = 0;
            }
        }

        // Update enemies (Move) AFTER collisions have potentially applied slows
        this.enemies.forEach(e => e.update(dt, this.player!.pos));

        for (const e of this.enemies) {
            if (checkCollision(e, this.player)) {
                this.player.takeDamage(e.damage * dt);
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].isDead) {
                const enemy = this.enemies[i];
                // Drop XP crystals instead of giving XP directly
                const crystalValue = enemy.xpValue;
                this.spawnXPCrystal(enemy.pos.x, enemy.pos.y, crystalValue);
                this.enemies.splice(i, 1);
            }
        }

        // Update XP crystals
        for (let i = this.xpCrystals.length - 1; i >= 0; i--) {
            const crystal = this.xpCrystals[i];
            crystal.update(dt, this.player.pos, this.player.stats.magnet);

            // Check collision with player
            if (checkCollision(crystal, this.player)) {
                if (crystal.isPowerCrystal) {
                    // Activate weapon speed boost
                    this.player.activateWeaponSpeedBoost(10, 10);
                } else {
                    // Give XP
                    this.player.gainXp(crystal.value);
                }
                this.xpCrystals.splice(i, 1);
            } else if (crystal.isDead) {
                this.xpCrystals.splice(i, 1);
            }
        }

        if (this.player.isDead) {
            this.state = 'GAME_OVER';
            this.showGameOver();
        }

        this.camera.x = this.player.pos.x - this.canvas.width / 2;
        this.camera.y = this.player.pos.y - this.canvas.height / 2;

        this.updateHUD();
    }

    showGameOver() {
        const screen = document.createElement('div');
        screen.className = 'screen';
        screen.innerHTML = `
        <h1>GAME OVER</h1>
        <h2>Time: ${Math.floor(this.gameTime)}s</h2>
        <button class="interactive" style="padding: 20px; font-size: 20px; cursor: pointer;" onclick="location.reload()">RESTART</button>
      `;
        this.uiLayer.appendChild(screen);
    }

    spawnEnemy() {
        if (!this.player) return;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(this.canvas.width, this.canvas.height) / 2 + 100;
        const x = this.player.pos.x + Math.cos(angle) * dist;
        const y = this.player.pos.y + Math.sin(angle) * dist;

        let type = ENEMIES[0];
        if (this.gameTime > 30) type = ENEMIES[1];
        if (this.gameTime > 60) type = ENEMIES[2];
        if (this.gameTime > 120) type = ENEMIES[3];
        if (this.gameTime > 180) type = ENEMIES[4];
        if (this.gameTime > 240) type = ENEMIES[5]; // Golem
        if (this.gameTime > 300) type = ENEMIES[6]; // Spectre
        if (this.gameTime > 360) type = ENEMIES[7]; // Boss

        // 1% chance to spawn elite enemy
        const isElite = Math.random() < 0.01;

        // Create enemy and apply time-based scaling
        const enemy = new Enemy(x, y, type, isElite);

        // Enemies get stronger over time
        const timeMultiplier = 1 + (this.gameTime / 300); // +1 multiplier every 5 minutes
        enemy.maxHp = enemy.baseHp * Math.min(timeMultiplier, 3); // Cap at 3x HP
        enemy.hp = enemy.maxHp;
        // Remove cap on damage or make it much higher
        enemy.damage *= (1 + (this.gameTime / 300)); // Uncapped damage scaling

        this.enemies.push(enemy);
    }

    spawnDamageNumber(pos: Vector2, amount: number) {
        this.damageNumbers.push({
            x: pos.x,
            y: pos.y,
            text: Math.floor(amount).toString(),
            life: 0.5
        });
    }

    spawnXPCrystal(x: number, y: number, value: number) {
        // 0.1% chance to spawn power crystal (Star) - Reduced from 1%
        if (Math.random() < 0.001) {
            const crystal = new XPCrystal(x, y, 'power');
            this.xpCrystals.push(crystal);
            return;
        }

        // Determine crystal type based on value
        let type: 'blue' | 'green' | 'red' | 'purple' = 'blue';
        if (value >= 50) {
            type = 'purple';
        } else if (value >= 20) {
            type = 'red';
        } else if (value >= 5) {
            type = 'green';
        }

        const crystal = new XPCrystal(x, y, type);
        this.xpCrystals.push(crystal);
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.state !== 'PLAYING' && this.state !== 'LEVEL_UP') return;

        this.drawGrid(ctx);

        this.projectiles.forEach(p => {
            if (p instanceof Zone) p.draw(ctx, this.camera);
        });

        // Draw XP crystals
        this.xpCrystals.forEach(c => c.draw(ctx, this.camera));

        this.enemies.forEach(e => e.draw(ctx, this.camera));

        this.player?.draw(ctx, this.camera);

        this.projectiles.forEach(p => {
            if (p instanceof Projectile) p.draw(ctx, this.camera);
        });

        ctx.font = '20px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        this.damageNumbers.forEach((dn, i) => {
            const screenX = dn.x - this.camera.x;
            const screenY = dn.y - this.camera.y - (0.5 - dn.life) * 50;
            ctx.fillText(dn.text, screenX, screenY);
            dn.life -= 0.016;
            if (dn.life <= 0) this.damageNumbers.splice(i, 1);
        });
    }

    drawGrid(ctx: CanvasRenderingContext2D) {
        const gridSize = 100;
        const offsetX = -this.camera.x % gridSize;
        const offsetY = -this.camera.y % gridSize;

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = offsetX; x < this.canvas.width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
        }
        for (let y = offsetY; y < this.canvas.height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
        }
        ctx.stroke();
    }
}
