/**
 * OPTIONS SCREEN - Game settings (audio volumes)
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { audio } from '../../core/AudioSystem';
import { juice } from '../../core/JuiceSystem';

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
        sliders.appendChild(this.createJuiceToggle());
        screen.appendChild(sliders);

        // Back button
        screen.appendChild(this.createPixelButton('← BACK', () => screenManager.goBack()));

        this.uiLayer.appendChild(screen);
    }

    private createVolumeSlider(label: string, channel: 'master' | 'sfx' | 'music'): HTMLElement {
        const row = document.createElement('div');
        row.className = 'option-row interactive';

        const text = document.createElement('span');
        text.style.cssText = 'min-width: 110px; text-align: left;';
        text.textContent = label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = String(Math.round(audio.settings[channel] * 100));
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

    /** Toggle for players who don't want shake / flashes / hit-stop */
    private createJuiceToggle(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'option-row interactive';

        const text = document.createElement('span');
        text.style.cssText = 'min-width: 110px; text-align: left;';
        text.textContent = '💥 Screen FX';

        const btn = document.createElement('button');
        btn.className = 'pixel-btn interactive';
        btn.style.flex = '1';
        const render = () => { btn.textContent = juice.enabled ? 'ON' : 'OFF'; };
        render();
        btn.onclick = () => {
            juice.enabled = !juice.enabled;
            if (!juice.enabled) juice.reset();
            render();
            audio.play('uiSelect');
        };

        row.appendChild(text);
        row.appendChild(btn);
        return row;
    }
}
