/**
 * MAIN MENU SCREEN — pixel-art title screen.
 *
 * The title itself is rendered on the game canvas with the procedural bitmap
 * font (see core/PixelFont) on top of the animated MenuBackdrop, so the whole
 * screen is generated in code — no fonts, no images. The DOM layer only holds
 * the buttons, which need real hit-testing and focus handling.
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { drawPixelText, measurePixelText, PIXEL_GLYPH_HEIGHT } from '../../core/PixelFont';

export class MainMenuScreen extends BaseScreen {
    private time: number = 0;
    /** Countdown to the next title glitch, in seconds */
    private glitchCooldown: number = 2;
    private glitchTime: number = 0;

    enter(): void {
        this.clearUI();
        this.time = 0;
        this.createScreen();
    }

    exit(): void {
        this.clearUI();
    }

    update(dt: number): void {
        this.time += dt;

        // Occasional CRT-style glitch on the logo
        this.glitchCooldown -= dt;
        if (this.glitchCooldown <= 0) {
            this.glitchTime = 0.18;
            this.glitchCooldown = 2.5 + Math.random() * 4;
        }
        if (this.glitchTime > 0) this.glitchTime -= dt;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Scale the logo to fit the widest word with margins
        const widest = measurePixelText('SURVIVORS', 1, 1);
        const scale = Math.max(2, Math.floor(Math.min(w * 0.8 / widest, h * 0.1 / PIXEL_GLYPH_HEIGHT)));
        const lineHeight = (PIXEL_GLYPH_HEIGHT + 2) * scale;
        const topY = Math.round(h * 0.16);
        const cx = Math.round(w / 2);

        ctx.save();
        ctx.imageSmoothingEnabled = false;

        const glitching = this.glitchTime > 0;
        const wobble = (i: number) => Math.sin(this.time * 2.6 + i * 0.5) * 0.5;

        // Chromatic split behind the logo — cheap "RGB fringe" look
        if (glitching) {
            const jitter = (Math.random() - 0.5) * scale * 3;
            ctx.globalAlpha = 0.6;
            drawPixelText(ctx, 'COSMOS', cx + jitter, topY, {
                scale, align: 'center', color: '#ff0055', spacing: 1, wave: wobble,
            });
            drawPixelText(ctx, 'SURVIVORS', cx - jitter, topY + lineHeight, {
                scale, align: 'center', color: '#00ffee', spacing: 1, wave: wobble,
            });
            ctx.globalAlpha = 1;
        }

        const shimmer = 0.5 + 0.5 * Math.sin(this.time * 1.6);
        drawPixelText(ctx, 'COSMOS', cx, topY, {
            scale,
            align: 'center',
            spacing: 1,
            outline: '#12002a',
            shadow: 1,
            shadowColor: 'rgba(255, 0, 128, 0.55)',
            gradient: ['#ffffff', '#66f7ff', '#0aa6ff'],
            wave: wobble,
        });
        drawPixelText(ctx, 'SURVIVORS', cx, topY + lineHeight, {
            scale,
            align: 'center',
            spacing: 1,
            outline: '#12002a',
            shadow: 1,
            shadowColor: 'rgba(0, 200, 255, 0.55)',
            gradient: ['#fff6a0', `rgba(255, ${Math.round(120 + 90 * shimmer)}, 40, 1)`, '#ff2f7a'],
            wave: (i) => wobble(i + 3),
        });

        // Blinking tagline under the logo
        const blink = Math.sin(this.time * 3.4) > -0.3;
        if (blink) {
            drawPixelText(ctx, 'SURVIVE THE COSMIC CHAOS', cx, topY + lineHeight * 2 + scale * 4, {
                scale: Math.max(1, Math.floor(scale / 3)),
                align: 'center',
                spacing: 1,
                color: '#8fe9ff',
                shadow: 1,
            });
        }

        ctx.restore();
    }

    private createScreen(): void {
        const screen = document.createElement('div');
        screen.className = 'screen screen--menu';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'menu-buttons';

        buttonContainer.appendChild(
            this.createPixelButton('▶ START', () => screenManager.goto('class_selection'), 'primary')
        );
        buttonContainer.appendChild(
            this.createPixelButton('⚙ OPTIONS', () => screenManager.goto('options'))
        );
        buttonContainer.appendChild(
            this.createPixelButton('🔬 PARTICLE LAB', () => screenManager.goto('particle_debug'), 'ghost')
        );

        screen.appendChild(buttonContainer);

        const footer = document.createElement('div');
        footer.className = 'menu-footer';
        footer.textContent = 'WASD / DRAG TO MOVE · WEAPONS FIRE THEMSELVES';
        screen.appendChild(footer);

        this.uiLayer.appendChild(screen);
    }
}
