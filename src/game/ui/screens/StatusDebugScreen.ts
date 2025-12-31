/**
 * STATUS DEBUG SCREEN - Debug screen for testing status effects
 * 
 * Features:
 *   - Enemy in center with high HP (respawns if killed)
 *   - Buttons to apply status effects
 *   - Visual feedback for each effect type
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { particles } from '../../core/ParticleSystem';
import { Enemy, type EnemyType } from '../../entities/Enemy';
import { Burn, Slow, Stun } from '../../status';
import { damageSystem } from '../../core/DamageSystem';
import type { Vector2 } from '../../core/Utils';

interface EffectButton {
    name: string;
    emoji: string;
    color: string;
    create: () => void;
}

// Test enemy type with high HP
const TEST_ENEMY_TYPE: EnemyType = {
    name: 'Test Dummy',
    hp: 1000,
    speed: 0,
    damage: 0,
    xpValue: 0,
    emoji: '🎯'
};

export class StatusDebugScreen extends BaseScreen {
    private animationId: number | null = null;
    private lastTime: number = 0;
    private enemy: Enemy | null = null;
    private damageNumbers: { x: number, y: number, text: string, life: number, isCrit: boolean }[] = [];
    private effectCountLabel: HTMLSpanElement | null = null;
    private enemyHpLabel: HTMLSpanElement | null = null;

    private effects: EffectButton[] = [];

    enter(): void {
        this.clearUI();
        this.spawnEnemy();
        this.setupEffects();
        this.createUI();
        this.startLoop();

        // Connect damage system to our damage numbers
        damageSystem.setDamageNumberCallback((pos, amount, isCrit) => {
            this.spawnDamageNumber(pos, amount, isCrit);
        });
    }

    exit(): void {
        this.stopLoop();
        this.clearUI();
        particles.clear();
        this.enemy = null;
    }

    private setupEffects(): void {
        this.effects = [
            {
                name: 'Burn (3s, 15 dmg)',
                emoji: '🔥',
                color: '#ff6600',
                create: () => this.enemy?.applyEffect(new Burn(3.0, 15))
            },
            {
                name: 'Burn (5s, 25 dmg)',
                emoji: '🔥🔥',
                color: '#ff3300',
                create: () => this.enemy?.applyEffect(new Burn(5.0, 25))
            },
            {
                name: 'Slow 50% (3s)',
                emoji: '🐌',
                color: '#00aaff',
                create: () => this.enemy?.applyEffect(new Slow(3.0, 0.5))
            },
            {
                name: 'Slow 80% (2s)',
                emoji: '🧊',
                color: '#88ccff',
                create: () => this.enemy?.applyEffect(new Slow(2.0, 0.8))
            },
            {
                name: 'Stun (1s)',
                emoji: '⚡',
                color: '#ffff00',
                create: () => this.enemy?.applyEffect(new Stun(1.0))
            },
            {
                name: 'Stun (3s)',
                emoji: '💫',
                color: '#ffcc00',
                create: () => this.enemy?.applyEffect(new Stun(3.0))
            },
        ];
    }

    private spawnEnemy(): void {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        this.enemy = new Enemy(cx, cy, TEST_ENEMY_TYPE);
        this.enemy.maxHp = 1000;
        this.enemy.hp = 1000;
    }

    private spawnDamageNumber(pos: Vector2, amount: number, isCrit: boolean): void {
        this.damageNumbers.push({
            x: pos.x,
            y: pos.y,
            text: Math.floor(amount).toString() + (isCrit ? '!' : ''),
            life: 0.5,
            isCrit
        });
    }

    private createUI(): void {
        const container = document.createElement('div');
        container.id = 'status-debug-container';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            pointer-events: none;
            z-index: 10;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 15px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0));
            pointer-events: auto;
        `;

        const title = document.createElement('h2');
        title.textContent = '🧪 Status Effect Debug';
        title.style.cssText = `
            color: #ff6600;
            margin: 0 0 10px 0;
            text-shadow: 0 0 10px rgba(255, 102, 0, 0.5);
        `;
        header.appendChild(title);

        // Stats row
        const statsRow = document.createElement('div');
        statsRow.style.cssText = 'display: flex; gap: 20px; color: #aaa;';

        const effectCount = document.createElement('span');
        effectCount.innerHTML = 'Effects: <span id="effect-count" style="color: #ff6600">0</span>';
        statsRow.appendChild(effectCount);

        const enemyHp = document.createElement('span');
        enemyHp.innerHTML = 'Enemy HP: <span id="enemy-hp" style="color: #ff3333">1000</span>';
        statsRow.appendChild(enemyHp);

        header.appendChild(statsRow);
        container.appendChild(header);

        // Effect buttons sidebar
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            position: absolute;
            left: 10px;
            top: 120px;
            bottom: 70px;
            width: 200px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            overflow-y: auto;
            padding: 10px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 10px;
            border: 1px solid rgba(255, 102, 0, 0.3);
            pointer-events: auto;
        `;

        // Section label
        const sectionLabel = document.createElement('div');
        sectionLabel.textContent = '⚡ Apply Effects';
        sectionLabel.style.cssText = 'color: #ff6600; font-weight: bold; margin-bottom: 5px;';
        sidebar.appendChild(sectionLabel);

        this.effects.forEach(effect => {
            const btn = document.createElement('button');
            btn.innerHTML = `${effect.emoji} ${effect.name}`;
            btn.style.cssText = `
                padding: 10px 12px;
                font-size: 0.9em;
                font-family: inherit;
                background: rgba(255, 102, 0, 0.1);
                border: 1px solid ${effect.color}44;
                border-radius: 6px;
                color: ${effect.color};
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: left;
            `;
            btn.onmouseenter = () => {
                btn.style.background = `${effect.color}33`;
                btn.style.borderColor = effect.color;
            };
            btn.onmouseleave = () => {
                btn.style.background = 'rgba(255, 102, 0, 0.1)';
                btn.style.borderColor = `${effect.color}44`;
            };
            btn.onclick = () => effect.create();
            sidebar.appendChild(btn);
        });

        // Clear effects button
        const clearBtn = document.createElement('button');
        clearBtn.innerHTML = '🗑️ Clear All Effects';
        clearBtn.style.cssText = `
            padding: 10px 12px;
            font-size: 0.9em;
            font-family: inherit;
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid #ff3333;
            border-radius: 6px;
            color: #ff3333;
            cursor: pointer;
            margin-top: 10px;
        `;
        clearBtn.onclick = () => {
            if (this.enemy) this.enemy.effects = [];
        };
        sidebar.appendChild(clearBtn);

        // Reset enemy button
        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = '♻️ Reset Enemy';
        resetBtn.style.cssText = `
            padding: 10px 12px;
            font-size: 0.9em;
            font-family: inherit;
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid #33ff33;
            border-radius: 6px;
            color: #33ff33;
            cursor: pointer;
        `;
        resetBtn.onclick = () => this.spawnEnemy();
        sidebar.appendChild(resetBtn);

        container.appendChild(sidebar);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 15px;
            background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0));
            pointer-events: auto;
            gap: 20px;
        `;

        const backBtn = this.createButton('← Back to Menu', () => {
            screenManager.goto('main_menu');
        });
        footer.appendChild(backBtn);

        container.appendChild(footer);

        this.uiLayer.appendChild(container);

        // Store label references
        this.effectCountLabel = document.getElementById('effect-count') as HTMLSpanElement;
        this.enemyHpLabel = document.getElementById('enemy-hp') as HTMLSpanElement;
    }

    private createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'menu-button interactive';
        btn.textContent = text;
        btn.onclick = onClick;
        btn.style.cssText = `
            padding: 10px 25px;
            font-size: 1em;
            font-family: inherit;
            background: rgba(255, 102, 0, 0.1);
            border: 2px solid #ff6600;
            border-radius: 8px;
            color: #ff6600;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        btn.onmouseenter = () => btn.style.background = 'rgba(255, 102, 0, 0.3)';
        btn.onmouseleave = () => btn.style.background = 'rgba(255, 102, 0, 0.1)';
        return btn;
    }

    private startLoop(): void {
        this.lastTime = performance.now();
        const loop = (timestamp: number) => {
            const dt = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;

            this.update(Math.min(dt, 0.1));
            this.draw(this.ctx);

            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    private stopLoop(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    update(dt: number): void {
        // Update particles
        particles.update(dt);

        // Update enemy effects
        if (this.enemy) {
            this.enemy.speedMultiplier = 1; // Reset each frame
            this.enemy.updateEffects(dt);

            // Respawn if dead
            if (this.enemy.isDead) {
                this.spawnEnemy();
            }
        }

        // Update damage numbers
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            this.damageNumbers[i].life -= dt;
            if (this.damageNumbers[i].life <= 0) {
                this.damageNumbers.splice(i, 1);
            }
        }

        // Update UI labels
        if (this.effectCountLabel && this.enemy) {
            this.effectCountLabel.textContent = this.enemy.effects.length.toString();
        }
        if (this.enemyHpLabel && this.enemy) {
            this.enemyHpLabel.textContent = Math.floor(this.enemy.hp).toString();
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        // Dark background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        const gridSize = 50;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }

        // Draw enemy
        if (this.enemy) {
            this.drawEnemy(ctx);
        }

        // Draw particles
        particles.draw(ctx, { x: 0, y: 0 });

        // Draw damage numbers
        this.drawDamageNumbers(ctx);
    }

    private drawEnemy(ctx: CanvasRenderingContext2D): void {
        if (!this.enemy) return;

        const x = this.enemy.pos.x;
        const y = this.enemy.pos.y;

        ctx.save();
        ctx.translate(x, y);

        // Effect indicators (visual rings around enemy)
        this.drawEffectIndicators(ctx);

        // Enemy body (circle instead of emoji for performance)
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#444';
        ctx.fill();
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Target crosshair
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(15, 0);
        ctx.moveTo(0, -15);
        ctx.lineTo(0, 15);
        ctx.stroke();

        // HP bar
        const hpPercent = this.enemy.hp / this.enemy.maxHp;
        const barWidth = 60;
        const barHeight = 8;
        ctx.fillStyle = '#333';
        ctx.fillRect(-barWidth / 2, -50, barWidth, barHeight);
        ctx.fillStyle = hpPercent > 0.5 ? '#33ff33' : hpPercent > 0.25 ? '#ffcc00' : '#ff3333';
        ctx.fillRect(-barWidth / 2, -50, barWidth * hpPercent, barHeight);

        ctx.restore();
    }

    private drawEffectIndicators(ctx: CanvasRenderingContext2D): void {
        if (!this.enemy) return;

        let ringIndex = 0;
        const checkedTypes = new Set<string>();

        for (const effect of this.enemy.effects) {
            const effectType = effect.constructor.name;
            if (checkedTypes.has(effectType)) continue;
            checkedTypes.add(effectType);

            const radius = 40 + ringIndex * 12;
            const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);

            ctx.save();
            ctx.globalAlpha = pulse;

            if (effect instanceof Burn) {
                // Fire ring
                ctx.strokeStyle = '#ff6600';
                ctx.lineWidth = 4;
                ctx.setLineDash([8, 4]);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (effect instanceof Slow) {
                // Ice ring
                ctx.strokeStyle = '#00aaff';
                ctx.lineWidth = 3;
                ctx.setLineDash([4, 8]);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (effect instanceof Stun) {
                // Lightning ring
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 5;
                ctx.shadowColor = '#ffff00';
                ctx.shadowBlur = 10;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.setLineDash([]);
            ctx.restore();
            ringIndex++;
        }
    }

    private drawDamageNumbers(ctx: CanvasRenderingContext2D): void {
        ctx.textAlign = 'center';

        for (const dn of this.damageNumbers) {
            const yOffset = (0.5 - dn.life) * 50;
            const alpha = dn.life * 2;

            ctx.save();
            ctx.globalAlpha = alpha;

            if (dn.isCrit) {
                ctx.fillStyle = '#ffff00';
                ctx.font = 'bold 24px Arial';
                ctx.shadowColor = '#ff6600';
                ctx.shadowBlur = 5;
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.font = '18px Arial';
            }

            ctx.fillText(dn.text, dn.x, dn.y - yOffset);
            ctx.restore();
        }
    }
}
