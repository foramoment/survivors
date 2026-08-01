/**
 * GAME SCREEN - Main gameplay screen
 * 
 * Features:
 *   - HUD (HP bar, XP bar, timer, kill count)
 *   - Canvas game rendering (delegated to GameManager)
 *   - Level system integration (future)
 * 
 * Note: This screen wraps the GameManager gameplay. 
 * The actual game logic remains in GameManager, this screen handles UI lifecycle.
 */

import { BaseScreen } from '../BaseScreen';
import { HUD, type HUDData } from '../components/HUD';
import { BuildPanel } from '../components/BuildPanel';
import { engine } from '../../core/Engine';
import { i18n } from '../../core/I18n';

export interface GameScreenParams {
    classIndex: number;
    devMode: boolean;
    stageIndex?: number;
    levelId?: string;
}

export class GameScreen extends BaseScreen {
    private hud: HUD | null = null;
    private buildPanel: BuildPanel | null = null;
    private i18nUnsub: (() => void) | null = null;
    private classIndex: number = 0;
    private devMode: boolean = false;
    private stageIndex: number = 0;

    enter(params?: GameScreenParams): void {
        this.classIndex = params?.classIndex ?? 0;
        this.devMode = params?.devMode ?? false;
        this.stageIndex = params?.stageIndex ?? 0;

        this.clearUI();

        // Create HUD
        this.hud = new HUD();
        this.hud.create(this.uiLayer);

        this.buildPanel = new BuildPanel();
        this.buildPanel.create(this.uiLayer);
        // Slot tooltips carry translated names, so a language switch mid-run
        // has to force the panel to redraw past its signature check
        this.i18nUnsub = i18n.onChange(() => this.buildPanel?.invalidate());

        // Touch players have no Escape key
        document.getElementById('hud-pause')?.addEventListener('click', () => {
            engine?.gameManager.togglePause();
        });

        // Start the game via GameManager
        if (engine?.gameManager) {
            engine.gameManager.devMode = this.devMode;
            engine.gameManager.startGame(this.classIndex, this.stageIndex);
        }
    }

    exit(): void {
        this.hud?.destroy();
        this.hud = null;
        this.buildPanel?.destroy();
        this.buildPanel = null;
        this.i18nUnsub?.();
        this.i18nUnsub = null;
        this.clearUI();
    }

    /**
     * Update HUD with current game state
     * Called from GameManager.update() or Engine loop
     */
    updateHUD(data: HUDData): void {
        this.hud?.update(data);

        const manager = engine?.gameManager;
        if (manager) {
            this.buildPanel?.update({
                weaponLevels: manager.weaponLevels,
                powerupLevels: manager.powerupLevels,
            });
        }
    }

    /**
     * Get the HUD component (for external access if needed)
     */
    getHUD(): HUD | null {
        return this.hud;
    }
}
