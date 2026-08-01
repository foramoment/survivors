/**
 * OPTIONS SCREEN - Game settings (audio volumes, screen FX)
 *
 * The controls themselves live in ui/components/SettingsPanel so the pause
 * overlay can mount the exact same block mid-run.
 */

import { BaseScreen } from '../BaseScreen';
import { screenManager } from '../ScreenManager';
import { createSettingsPanel } from '../components/SettingsPanel';

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

        const title = document.createElement('h1');
        title.textContent = '⚙️ OPTIONS';
        screen.appendChild(title);

        screen.appendChild(createSettingsPanel());

        screen.appendChild(this.createPixelButton('← BACK', () => screenManager.goBack()));

        this.uiLayer.appendChild(screen);
    }
}
