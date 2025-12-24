/**
 * GAME OVER SCREEN - Displayed when player dies
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';

export interface GameOverParams {
    gameTime: number;
    killCount: number;
    level: number;
}

export class GameOverScreen extends BaseScreen {
    private gameTime: number = 0;
    private killCount: number = 0;
    private level: number = 1;

    enter(params?: GameOverParams): void {
        this.gameTime = params?.gameTime ?? 0;
        this.killCount = params?.killCount ?? 0;
        this.level = params?.level ?? 1;

        this.clearUI();
        this.createScreen();
    }

    exit(): void {
        this.clearUI();
    }

    private createScreen(): void {
        const screen = document.createElement('div');
        screen.className = 'screen';
        screen.style.backgroundColor = 'rgba(50, 0, 0, 0.9)';

        // Title
        const title = document.createElement('h1');
        title.textContent = '💀 GAME OVER';
        title.style.color = '#ff4444';
        screen.appendChild(title);

        // Stats
        const stats = document.createElement('div');
        stats.style.cssText = 'margin: 30px 0; text-align: center;';

        const mins = Math.floor(this.gameTime / 60);
        const secs = Math.floor(this.gameTime % 60);
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        stats.innerHTML = `
            <p style="font-size: 1.5em; margin: 15px 0;">⏱️ Time Survived: <strong>${timeStr}</strong></p>
            <p style="font-size: 1.5em; margin: 15px 0;">💀 Enemies Killed: <strong>${this.killCount}</strong></p>
            <p style="font-size: 1.5em; margin: 15px 0;">📊 Level Reached: <strong>${this.level}</strong></p>
        `;
        screen.appendChild(stats);

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 20px; margin-top: 30px;';

        const retryBtn = this.createButton('🔄 Play Again', () => {
            screenManager.goto('class_selection');
        });
        buttonContainer.appendChild(retryBtn);

        const menuBtn = this.createButton('🏠 Main Menu', () => {
            screenManager.goto('main_menu');
        });
        buttonContainer.appendChild(menuBtn);

        screen.appendChild(buttonContainer);
        this.uiLayer.appendChild(screen);
    }

    private createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'menu-button interactive';
        btn.textContent = text;
        btn.onclick = onClick;
        btn.style.cssText = `
            padding: 15px 40px;
            font-size: 1.2em;
            font-family: inherit;
            background: rgba(255, 100, 100, 0.2);
            border: 2px solid #ff6666;
            border-radius: 10px;
            color: #ff6666;
            cursor: pointer;
            transition: all 0.3s ease;
        `;

        btn.onmouseenter = () => {
            btn.style.background = 'rgba(255, 100, 100, 0.4)';
            btn.style.transform = 'scale(1.05)';
        };

        btn.onmouseleave = () => {
            btn.style.background = 'rgba(255, 100, 100, 0.2)';
            btn.style.transform = 'scale(1)';
        };

        return btn;
    }
}
