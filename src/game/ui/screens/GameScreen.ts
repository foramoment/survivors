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
import { HUD } from '../components/HUD';
import { engine } from '../../core/Engine';

export interface GameScreenParams {
    classIndex: number;
    devMode: boolean;
    levelId?: string;
}

export class GameScreen extends BaseScreen {
    private hud: HUD | null = null;
    private classIndex: number = 0;
    private devMode: boolean = false;

    enter(params?: GameScreenParams): void {
        this.classIndex = params?.classIndex ?? 0;
        this.devMode = params?.devMode ?? false;

        this.clearUI();

        // Create HUD
        this.hud = new HUD();
        this.hud.create(this.uiLayer);

        // Start the game via GameManager
        if (engine?.gameManager) {
            engine.gameManager.devMode = this.devMode;
            engine.gameManager.startGame(this.classIndex);
        }
    }

    exit(): void {
        this.hud?.destroy();
        this.hud = null;
        this.clearUI();
    }

    /**
     * Update HUD with current game state
     * Called from GameManager.update() or Engine loop
     */
    updateHUD(data: {
        hp: number;
        maxHp: number;
        xp: number;
        xpToLevel: number;
        level: number;
        gameTime: number;
        killCount: number;
        powerBoostActive?: boolean;
    }): void {
        this.hud?.update(data);
    }

    /**
     * Get the HUD component (for external access if needed)
     */
    getHUD(): HUD | null {
        return this.hud;
    }
}
