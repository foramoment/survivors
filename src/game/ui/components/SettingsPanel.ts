/**
 * SETTINGS PANEL — language, audio volumes, screen FX.
 *
 * Shared by the Options screen and the in-run pause overlay. Both mount the
 * same controls bound to the same singletons, so there is no second copy of the
 * state to keep in sync: quitting to the menu after changing the music slider
 * mid-run shows the new value.
 */

import { audio } from '../../core/AudioSystem';
import { juice } from '../../core/JuiceSystem';
import { damageNumberSettings } from '../../core/DamageNumbers';
import { i18n, t, LANGUAGES } from '../../core/I18n';

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
    text.textContent = `💥 ${t('options.screenFx')}`;

    const btn = document.createElement('button');
    btn.className = 'pixel-btn interactive';
    btn.style.flex = '1';
    const render = () => { btn.textContent = juice.enabled ? t('common.on') : t('common.off'); };
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
 * Toggle for the floating damage numbers.
 *
 * They are merged rather than stacked (see core/DamageNumbers), which fixes
 * most of the clutter — but reading a fight with no digits at all is a real
 * preference, and in a bullet-heaven the numbers are the thing most likely to
 * hide the gap you are trying to walk through.
 */
export function createDamageNumberToggle(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'option-row interactive';

    const text = document.createElement('span');
    text.className = 'option-label';
    text.textContent = `🔢 ${t('options.damageNumbers')}`;

    const btn = document.createElement('button');
    btn.className = 'pixel-btn interactive';
    btn.style.flex = '1';
    const render = () => {
        btn.textContent = damageNumberSettings.enabled ? t('common.on') : t('common.off');
    };
    render();
    btn.onclick = () => {
        damageNumberSettings.set(!damageNumberSettings.enabled);
        render();
        audio.play('uiSelect');
    };

    row.appendChild(text);
    row.appendChild(btn);
    return row;
}

/**
 * Language picker. Every label on screen is built in the screen's enter(), so
 * switching fires i18n's change listeners and the host rebuilds itself — this
 * control does not try to patch the DOM around it.
 */
export function createLanguageRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'option-row interactive';

    const text = document.createElement('span');
    text.className = 'option-label';
    text.textContent = `🌐 ${t('options.language')}`;

    const group = document.createElement('div');
    group.className = 'option-choices';

    for (const lang of LANGUAGES) {
        const btn = document.createElement('button');
        btn.className = 'pixel-btn interactive' + (i18n.lang === lang.id ? ' pixel-btn--primary' : '');
        btn.textContent = lang.label;
        btn.onclick = () => {
            audio.play('uiSelect');
            i18n.setLang(lang.id);
        };
        group.appendChild(btn);
    }

    row.appendChild(text);
    row.appendChild(group);
    return row;
}

/**
 * The full settings block: language, three volumes, screen FX.
 * `compact` tightens the spacing for the pause overlay.
 */
export function createSettingsPanel(compact: boolean = false): HTMLElement {
    const panel = document.createElement('div');
    panel.className = compact ? 'settings-panel settings-panel--compact' : 'settings-panel';
    panel.appendChild(createLanguageRow());
    panel.appendChild(createVolumeSlider(`🔊 ${t('options.master')}`, 'master'));
    panel.appendChild(createVolumeSlider(`💥 ${t('options.sfx')}`, 'sfx'));
    panel.appendChild(createVolumeSlider(`🎵 ${t('options.music')}`, 'music'));
    panel.appendChild(createJuiceToggle());
    panel.appendChild(createDamageNumberToggle());
    return panel;
}
