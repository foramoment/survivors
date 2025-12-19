/**
 * STATE MACHINE - Game state management with pause support
 * 
 * Usage:
 *   import { stateMachine } from './StateMachine';
 *   
 *   stateMachine.transition('LEVEL_UP');
 *   if (stateMachine.isPaused()) return; // Skip game logic
 */
import { events } from './EventBus';

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'LEVEL_UP' | 'GAME_OVER';

class StateMachineClass {
    private _state: GameState = 'MENU';

    get state(): GameState {
        return this._state;
    }

    /**
     * Transition to a new state
     */
    transition(to: GameState): void {
        if (this._state === to) return;

        const from = this._state;
        this._state = to;

        events.emit({ type: 'STATE_CHANGED', from, to });

        console.log(`[StateMachine] ${from} → ${to}`);
    }

    /**
     * Check if game logic should be paused
     */
    isPaused(): boolean {
        return this._state !== 'PLAYING';
    }

    /**
     * Check if we're in a specific state
     */
    is(state: GameState): boolean {
        return this._state === state;
    }

    /**
     * Reset to menu state
     */
    reset(): void {
        this._state = 'MENU';
    }
}

// Singleton instance
export const stateMachine = new StateMachineClass();
