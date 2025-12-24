/**
 * OPTIONS SCREEN - Game settings (stub for now)
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';

export class OptionsScreen extends BaseScreen {
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
        title.textContent = '⚙️ OPTIONS';
        screen.appendChild(title);

        // Placeholder message
        const message = document.createElement('p');
        message.style.cssText = 'color: #888; margin: 30px 0;';
        message.textContent = 'Settings coming soon...';
        screen.appendChild(message);

        // Back button
        const backBtn = this.createButton('← Back', () => {
            screenManager.goBack();
        });
        screen.appendChild(backBtn);

        this.uiLayer.appendChild(screen);
    }

    private createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'menu-button interactive';
        btn.textContent = text;
        btn.onclick = onClick;
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
        `;

        btn.onmouseenter = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.3)';
            btn.style.transform = 'scale(1.05)';
        };

        btn.onmouseleave = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.1)';
            btn.style.transform = 'scale(1)';
        };

        return btn;
    }
}
