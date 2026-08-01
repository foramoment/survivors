/**
 * GAME OVER SCREEN - Displayed when player dies
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { t } from '../../core/I18n';

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
        screen.className = 'screen result-screen result-screen--defeat';

        const title = document.createElement('h1');
        title.textContent = t('result.gameOver');
        screen.appendChild(title);

        const mins = Math.floor(this.gameTime / 60);
        const secs = Math.floor(this.gameTime % 60);
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const stats = document.createElement('div');
        stats.className = 'result-stats';
        stats.innerHTML = `
            <div class="result-stat"><span>${t('result.time')}</span><strong>${timeStr}</strong></div>
            <div class="result-stat"><span>${t('result.kills')}</span><strong>${this.killCount}</strong></div>
            <div class="result-stat"><span>${t('result.level')}</span><strong>${this.level}</strong></div>
        `;
        screen.appendChild(stats);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'menu-buttons menu-buttons--row';
        buttonContainer.appendChild(
            this.createPixelButton(t('result.again'), () => screenManager.goto('class_selection'), 'primary')
        );
        buttonContainer.appendChild(
            this.createPixelButton(t('result.menu'), () => screenManager.goto('main_menu'))
        );

        screen.appendChild(buttonContainer);
        this.uiLayer.appendChild(screen);
    }
}
