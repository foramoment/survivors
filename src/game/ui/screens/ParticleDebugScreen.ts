/**
 * PARTICLE DEBUG SCREEN - Debug screen for particle system testing
 * 
 * Features:
 *   - All particle effect methods available
 *   - Configurable radius slider
 *   - Proper layering (controls overlay on canvas)
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { particles } from '../../core/ParticleSystem';

interface EffectButton {
    name: string;
    emoji: string;
    fn: (x: number, y: number, radius: number) => void;
    hasRadius: boolean;
}

export class ParticleDebugScreen extends BaseScreen {
    private animationId: number | null = null;
    private lastTime: number = 0;
    private radius: number = 50;
    private radiusSlider: HTMLInputElement | null = null;
    private radiusLabel: HTMLSpanElement | null = null;
    private particleCountLabel: HTMLSpanElement | null = null;

    // All available particle effects
    private effects: EffectButton[] = [
        { name: 'Hit', emoji: '✨', fn: (x, y) => particles.emitHit(x, y, '#00ffff'), hasRadius: false },
        { name: 'Explosion', emoji: '💥', fn: (x, y, r) => particles.emitExplosion(x, y, r), hasRadius: true },
        { name: 'Lightning', emoji: '⚡', fn: (x, y) => particles.emitLightning(x, y), hasRadius: false },
        { name: 'Frost', emoji: '❄️', fn: (x, y) => particles.emitFrost(x, y), hasRadius: false },
        { name: 'Fire', emoji: '🔥', fn: (x, y) => particles.emitFire(x, y), hasRadius: false },
        { name: 'Poison', emoji: '☠️', fn: (x, y) => particles.emitPoison(x, y), hasRadius: false },
        { name: 'Orbital Strike', emoji: '🛰️', fn: (x, y, r) => particles.emitOrbitalStrike(x, y, r), hasRadius: true },
        { name: 'Nuclear', emoji: '☢️', fn: (x, y, r) => particles.emitNuclear(x, y, r), hasRadius: true },
        { name: 'Beam Charge', emoji: '💜', fn: (x, y) => particles.emitBeamCharge(x, y, '#ff00ff'), hasRadius: false },
        { name: 'Trail', emoji: '💫', fn: (x, y) => particles.emitTrail(x, y, '#00ffff', 5), hasRadius: false },
        { name: 'Acid Bubble', emoji: '🧪', fn: (x, y, r) => particles.emitAcidBubble(x, y, r), hasRadius: true },
        { name: 'Cold Mist', emoji: '🧊', fn: (x, y, r) => particles.emitColdMist(x, y, r), hasRadius: true },
        { name: 'Spore Cloud', emoji: '🍄', fn: (x, y, r) => particles.emitSporeCloud(x, y, r), hasRadius: true },
        { name: 'Psionic Wave', emoji: '🧠', fn: (x, y, r) => particles.emitPsionicWave(x, y, r), hasRadius: true },
        { name: 'Psionic Charge', emoji: '🌀', fn: (x, y) => particles.emitPsionicCharge(x, y), hasRadius: false },
        { name: 'Nano Swarm', emoji: '🦠', fn: (x, y, r) => particles.emitNanoSwarm(x, y, r), hasRadius: true },
        { name: 'Singularity', emoji: '⚫', fn: (x, y, r) => particles.emitSingularityDistortion(x, y, r), hasRadius: true },
        { name: 'Plasma Energy', emoji: '🔋', fn: (x, y) => particles.emitPlasmaEnergy(x, y), hasRadius: false },
        { name: 'Plasma Explosion', emoji: '⚛️', fn: (x, y, r) => particles.emitPlasmaExplosion(x, y, r), hasRadius: true },
    ];

    enter(): void {
        this.clearUI();
        this.createUI();
        this.startLoop();
    }

    exit(): void {
        this.stopLoop();
        this.clearUI();
        particles.clear();
    }

    private createUI(): void {
        // Main container - transparent, doesn't block canvas
        const container = document.createElement('div');
        container.id = 'particle-debug-container';
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

        // Header (title + controls)
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 15px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0));
            pointer-events: auto;
        `;

        // Title
        const title = document.createElement('h2');
        title.textContent = '🔬 Particle Debug';
        title.style.cssText = `
            color: #00ffff;
            margin: 0 0 10px 0;
            text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        `;
        header.appendChild(title);

        // Controls row
        const controlsRow = document.createElement('div');
        controlsRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
            justify-content: center;
        `;

        // Radius control
        const radiusContainer = document.createElement('div');
        radiusContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const radiusText = document.createElement('span');
        radiusText.textContent = 'Radius:';
        radiusText.style.color = '#aaa';

        this.radiusSlider = document.createElement('input');
        this.radiusSlider.type = 'range';
        this.radiusSlider.min = '20';
        this.radiusSlider.max = '200';
        this.radiusSlider.value = this.radius.toString();
        this.radiusSlider.style.cssText = 'width: 120px; accent-color: #00ffff;';
        this.radiusSlider.oninput = () => {
            this.radius = parseInt(this.radiusSlider!.value);
            this.radiusLabel!.textContent = this.radius.toString();
        };

        this.radiusLabel = document.createElement('span');
        this.radiusLabel.textContent = this.radius.toString();
        this.radiusLabel.style.cssText = 'color: #00ffff; min-width: 35px;';

        radiusContainer.appendChild(radiusText);
        radiusContainer.appendChild(this.radiusSlider);
        radiusContainer.appendChild(this.radiusLabel);
        controlsRow.appendChild(radiusContainer);

        // Particle count
        const countContainer = document.createElement('div');
        countContainer.style.cssText = 'display: flex; align-items: center; gap: 5px;';
        const countText = document.createElement('span');
        countText.textContent = 'Particles:';
        countText.style.color = '#aaa';
        this.particleCountLabel = document.createElement('span');
        this.particleCountLabel.textContent = '0';
        this.particleCountLabel.style.cssText = 'color: #ffcc00; font-weight: bold;';
        countContainer.appendChild(countText);
        countContainer.appendChild(this.particleCountLabel);
        controlsRow.appendChild(countContainer);

        // Clear button
        const clearBtn = this.createButton('🗑️ Clear', () => particles.clear());
        clearBtn.style.padding = '5px 15px';
        controlsRow.appendChild(clearBtn);

        header.appendChild(controlsRow);
        container.appendChild(header);

        // Effect buttons grid - left side
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `
            position: absolute;
            left: 10px;
            top: 120px;
            bottom: 70px;
            width: 180px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            overflow-y: auto;
            padding: 10px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 10px;
            border: 1px solid rgba(0, 255, 255, 0.2);
            pointer-events: auto;
        `;

        // Add scrollbar styling inline
        sidebar.style.scrollbarWidth = 'thin';
        sidebar.style.scrollbarColor = '#00ffff rgba(0, 0, 0, 0.3)';

        this.effects.forEach(effect => {
            const btn = document.createElement('button');
            btn.className = 'effect-btn';
            btn.innerHTML = `${effect.emoji} ${effect.name}${effect.hasRadius ? ' *' : ''}`;
            btn.style.cssText = `
                padding: 8px 12px;
                font-size: 0.9em;
                font-family: inherit;
                background: rgba(0, 255, 255, 0.1);
                border: 1px solid rgba(0, 255, 255, 0.3);
                border-radius: 6px;
                color: #00ffff;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: left;
            `;
            btn.onmouseenter = () => {
                btn.style.background = 'rgba(0, 255, 255, 0.3)';
                btn.style.borderColor = '#00ffff';
            };
            btn.onmouseleave = () => {
                btn.style.background = 'rgba(0, 255, 255, 0.1)';
                btn.style.borderColor = 'rgba(0, 255, 255, 0.3)';
            };
            btn.onclick = () => {
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                effect.fn(cx, cy, this.radius);
            };
            sidebar.appendChild(btn);
        });

        container.appendChild(sidebar);

        // Footer (back button + instructions)
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

        const instructions = document.createElement('span');
        instructions.textContent = '* = uses radius | Effects spawn at center';
        instructions.style.cssText = 'color: #666; font-size: 0.85em;';
        footer.appendChild(instructions);

        container.appendChild(footer);

        this.uiLayer.appendChild(container);
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
            background: rgba(0, 255, 255, 0.1);
            border: 2px solid #00ffff;
            border-radius: 8px;
            color: #00ffff;
            cursor: pointer;
            transition: all 0.3s ease;
        `;

        btn.onmouseenter = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.3)';
        };

        btn.onmouseleave = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.1)';
        };

        return btn;
    }

    private startLoop(): void {
        this.lastTime = performance.now();
        const loop = (timestamp: number) => {
            const dt = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;

            this.update(Math.min(dt, 0.1));
            this.draw(this.ctx);

            // Update particle count
            if (this.particleCountLabel) {
                this.particleCountLabel.textContent = particles.getParticleCount().toString();
            }

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
        particles.update(dt);
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

        // Center crosshair
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // Radius circle preview
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Crosshair
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 30, cy);
        ctx.lineTo(cx + 30, cy);
        ctx.moveTo(cx, cy - 30);
        ctx.lineTo(cx, cy + 30);
        ctx.stroke();

        // Draw particles
        particles.draw(ctx, { x: 0, y: 0 });
    }
}
