/**
 * OPTIONS SCREEN - Game settings (audio volumes)
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { audio } from '../../core/AudioSystem';

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

        // Volume sliders
        const sliders = document.createElement('div');
        sliders.style.cssText = 'display: flex; flex-direction: column; gap: 20px; margin: 30px 0; min-width: 300px;';
        sliders.appendChild(this.createVolumeSlider('🔊 Master', 'master'));
        sliders.appendChild(this.createVolumeSlider('💥 Effects', 'sfx'));
        sliders.appendChild(this.createVolumeSlider('🎵 Music', 'music'));
        screen.appendChild(sliders);

        // Back button
        const backBtn = this.createButton('← Back', () => {
            screenManager.goBack();
        });
        screen.appendChild(backBtn);

        this.uiLayer.appendChild(screen);
    }

    private createVolumeSlider(label: string, channel: 'master' | 'sfx' | 'music'): HTMLElement {
        const row = document.createElement('div');
        row.className = 'interactive';
        row.style.cssText = 'display: flex; align-items: center; gap: 15px; color: #00ffff;';

        const text = document.createElement('span');
        text.style.cssText = 'min-width: 110px; text-align: left;';
        text.textContent = label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = String(Math.round(audio.settings[channel] * 100));
        slider.style.cssText = 'flex: 1; accent-color: #00ffff; cursor: pointer;';
        slider.oninput = () => {
            audio.setVolume(channel, Number(slider.value) / 100);
            value.textContent = `${slider.value}%`;
            if (channel !== 'music') audio.play('pickup'); // instant feedback
        };

        const value = document.createElement('span');
        value.style.cssText = 'min-width: 45px; text-align: right;';
        value.textContent = `${slider.value}%`;

        row.appendChild(text);
        row.appendChild(slider);
        row.appendChild(value);
        return row;
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
