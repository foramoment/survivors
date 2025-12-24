/**
 * SCREEN MANAGER - Singleton for managing screen transitions
 * 
 * Usage:
 *   import { screenManager } from './ScreenManager';
 *   
 *   // Register screens (once at startup)
 *   screenManager.register('main_menu', new MainMenuScreen(canvas, ctx));
 *   screenManager.register('game', new GameScreen(canvas, ctx));
 *   
 *   // Navigate
 *   screenManager.goto('main_menu');
 *   screenManager.goto('game', { levelId: 'level_1', classIndex: 0 });
 */

import { BaseScreen, type ScreenParams } from './BaseScreen';

export type ScreenId =
    | 'main_menu'
    | 'class_selection'
    | 'game'
    | 'game_over'
    | 'options'
    | 'particle_debug'
    | 'level_select';

class ScreenManagerClass {
    private screens: Map<ScreenId, BaseScreen> = new Map();
    private _currentScreen: BaseScreen | null = null;
    private _currentScreenId: ScreenId | null = null;
    private _previousScreenId: ScreenId | null = null;

    /**
     * Register a screen with an ID
     */
    register(id: ScreenId, screen: BaseScreen): void {
        this.screens.set(id, screen);
    }

    /**
     * Get a registered screen by ID
     */
    get(id: ScreenId): BaseScreen | undefined {
        return this.screens.get(id);
    }

    /**
     * Navigate to a different screen
     */
    goto(id: ScreenId, params?: ScreenParams): void {
        const nextScreen = this.screens.get(id);
        if (!nextScreen) {
            console.error(`[ScreenManager] Screen not found: ${id}`);
            return;
        }

        // Exit current screen
        if (this._currentScreen) {
            this._currentScreen.exit();
            this._previousScreenId = this._currentScreenId;
        }

        // Enter new screen
        this._currentScreenId = id;
        this._currentScreen = nextScreen;
        this._currentScreen.enter(params);

        console.log(`[ScreenManager] ${this._previousScreenId ?? 'null'} → ${id}`);
    }

    /**
     * Go back to the previous screen
     */
    goBack(params?: ScreenParams): void {
        if (this._previousScreenId) {
            this.goto(this._previousScreenId, params);
        }
    }

    /**
     * Update the current screen (call from main loop)
     */
    update(dt: number): void {
        this._currentScreen?.update(dt);
    }

    /**
     * Draw the current screen (call from main loop)
     */
    draw(ctx: CanvasRenderingContext2D): void {
        this._currentScreen?.draw(ctx);
    }

    /**
     * Get current screen ID
     */
    get currentScreenId(): ScreenId | null {
        return this._currentScreenId;
    }

    /**
     * Get current screen instance
     */
    get currentScreen(): BaseScreen | null {
        return this._currentScreen;
    }
}

// Singleton instance
export const screenManager = new ScreenManagerClass();
