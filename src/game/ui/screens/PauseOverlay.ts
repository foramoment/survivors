/**
 * PAUSE OVERLAY.
 *
 * Settings fold out in place rather than routing to the Options screen: that
 * would tear down the game screen and the run with it, so the same panel is
 * mounted here instead.
 *
 * `info` is a callback, not a value, because switching language rebuilds this
 * panel and the stage name is localised — a snapshot taken at open time would
 * come back in the old language.
 */
import { createSettingsPanel } from '../components/SettingsPanel';
import { audio } from '../../../engine/AudioSystem';
import { i18n, t } from '../../core/I18n';

export interface PauseInfo {
    stage: string;
    time: string;
    kills: number;
}

export interface PauseActions {
    onResume: () => void;
    onQuit: () => void;
}

export class PauseOverlay {
    private readonly uiLayer: HTMLElement;
    private el: HTMLElement | null = null;
    /** Survives a rebuild so a language switch keeps the settings panel open */
    private settingsOpen: boolean = false;
    private i18nUnsub: (() => void) | null = null;

    constructor(uiLayer: HTMLElement) {
        this.uiLayer = uiLayer;
    }

    open(info: () => PauseInfo, actions: PauseActions) {
        this.build(info, actions);

        // Switching language from the pause panel relabels the whole overlay.
        // Rebuilding it is simpler (and cheaper, once) than tracking every node.
        this.i18nUnsub = i18n.onChange(() => {
            if (!this.el) return;
            this.el.remove();
            this.build(info, actions);
        });
    }

    /** Safe to call when nothing is open — a new run calls it unconditionally */
    close() {
        this.i18nUnsub?.();
        this.i18nUnsub = null;
        this.el?.remove();
        this.el = null;
    }

    private build(info: () => PauseInfo, actions: PauseActions) {
        const screen = document.createElement('div');
        screen.className = 'screen pause-screen';
        this.el = screen;

        const heading = document.createElement('h2');
        heading.textContent = t('pause.title');
        screen.appendChild(heading);

        const status = document.createElement('p');
        status.className = 'pause-hint';
        status.textContent = t('pause.status', { ...info() });
        screen.appendChild(status);

        const buttons = document.createElement('div');
        buttons.className = 'pause-actions';
        buttons.appendChild(this.createButton(t('pause.resume'), 'primary', actions.onResume));

        const settings = createSettingsPanel(true);
        settings.hidden = !this.settingsOpen;

        const label = () => t('pause.settings') + (settings.hidden ? '' : ' ▴');
        const settingsBtn = this.createButton(label(), 'ghost', () => {
            settings.hidden = !settings.hidden;
            this.settingsOpen = !settings.hidden;
            settingsBtn.textContent = label();
        });
        buttons.appendChild(settingsBtn);
        buttons.appendChild(settings);

        buttons.appendChild(this.createButton(t('pause.quit'), 'danger', actions.onQuit));
        screen.appendChild(buttons);

        this.uiLayer.appendChild(screen);
    }

    /** Same look and blips as the menu buttons, without the screen base class */
    private createButton(text: string, variant: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = `pixel-btn pixel-btn--${variant} interactive`;
        btn.textContent = text;
        btn.addEventListener('pointerenter', () => audio.play('uiHover'));
        btn.addEventListener('click', () => {
            audio.play('uiSelect');
            onClick();
        });
        return btn;
    }
}
