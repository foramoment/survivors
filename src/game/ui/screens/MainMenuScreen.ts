/**
 * MAIN MENU SCREEN - Entry point with Start/Options buttons
 * 
 * Features:
 *   - Game title
 *   - Start button → navigates to Class Selection
 *   - Options button → navigates to Options (future)
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';

export class MainMenuScreen extends BaseScreen {
    enter(): void {
        this.clearUI();
        this.createScreen();
    }

    exit(): void {
        this.clearUI();
    }

    private createScreen(): void {
        const screen = document.createElement('div');
        screen.className = 'screen';

        // Title
        const title = document.createElement('h1');
        title.textContent = 'COSMOS SURVIVORS';
        screen.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.style.cssText = 'color: #888; margin-bottom: 40px; font-size: 1.2em;';
        subtitle.textContent = '🚀 Survive the Cosmic Chaos 🌌';
        screen.appendChild(subtitle);

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';

        // Start button
        const startBtn = this.createButton('🎮 START', () => {
            screenManager.goto('class_selection');
        });
        startBtn.style.fontSize = '1.5em';
        buttonContainer.appendChild(startBtn);

        // Options button
        const optionsBtn = this.createButton('⚙️ OPTIONS', () => {
            screenManager.goto('options');
        });
        buttonContainer.appendChild(optionsBtn);

        // Particle Debug button (dev)
        const debugBtn = this.createButton('🔬 Particle Debug', () => {
            screenManager.goto('particle_debug');
        });
        debugBtn.style.fontSize = '0.9em';
        debugBtn.style.opacity = '0.7';
        buttonContainer.appendChild(debugBtn);

        screen.appendChild(buttonContainer);
        this.uiLayer.appendChild(screen);
    }

    private createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'menu-button interactive';
        btn.textContent = text;
        btn.onclick = onClick;

        // Inline styles (will be moved to CSS later)
        btn.style.cssText = `
            padding: 15px 50px;
            font-size: 1.2em;
            font-family: inherit;
            background: rgba(0, 255, 255, 0.1);
            border: 2px solid #00ffff;
            border-radius: 10px;
            color: #00ffff;
            cursor: pointer;
            transition: all 0.3s ease;
            text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
        `;

        btn.onmouseenter = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.3)';
            btn.style.transform = 'scale(1.05)';
            btn.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.5)';
        };

        btn.onmouseleave = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.1)';
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = 'none';
        };

        return btn;
    }
}
