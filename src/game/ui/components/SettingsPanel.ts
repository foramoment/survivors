/**
 * SETTINGS PANEL — audio volumes + screen FX toggle.
 *
 * Shared by the Options screen and the in-run pause overlay. Both mount the
 * same controls bound to the same singletons, so there is no second copy of the
 * state to keep in sync: quitting to the menu after changing the music slider
 * mid-run shows the new value.
 */

import { audio } from '../../core/AudioSystem';
import { juice } from '../../core/JuiceSystem';

export type SettingsChannel = 'master' | 'sfx' | 'music';

/** A labelled volume slider bound to one audio channel */
export function createVolumeSlider(label: string, channel: SettingsChannel): HTMLElement {
    const row = document.createElement('div');
    row.className = 'option-row interactive';

    const text = document.createElement('span');
    text.className = 'option-label';
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
    value.className = 'option-value';
    value.textContent = `${slider.value}%`;

    row.appendChild(text);
    row.appendChild(slider);
    row.appendChild(value);
    return row;
}

/** Toggle for players who don't want shake / flashes / hit-stop */
export function createJuiceToggle(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'option-row interactive';

    const text = document.createElement('span');
    text.className = 'option-label';
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

/**
 * The full settings block: three volumes + screen FX.
 * `compact` tightens the spacing for the pause overlay.
 */
export function createSettingsPanel(compact: boolean = false): HTMLElement {
    const panel = document.createElement('div');
    panel.className = compact ? 'settings-panel settings-panel--compact' : 'settings-panel';
    panel.appendChild(createVolumeSlider('🔊 Master', 'master'));
    panel.appendChild(createVolumeSlider('💥 Effects', 'sfx'));
    panel.appendChild(createVolumeSlider('🎵 Music', 'music'));
    panel.appendChild(createJuiceToggle());
    return panel;
}
