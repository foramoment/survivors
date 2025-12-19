/**
 * EVENT BUS - Decoupled event system for game entities
 * 
 * Usage:
 *   import { events } from './EventBus';
 *   
 *   // Subscribe
 *   const unsubscribe = events.on('ENEMY_DIED', (e) => console.log(e.xpValue));
 *   
 *   // Emit
 *   events.emit({ type: 'ENEMY_DIED', enemy, pos, xpValue: 10 });
 *   
 *   // Unsubscribe
 *   unsubscribe();
 */

import { type Vector2 } from './Utils';

// ============================================
// EVENT TYPES - Add new events here
// ============================================
export type GameEvent =
    | { type: 'ENEMY_DIED'; enemy: any; pos: Vector2; xpValue: number }
    | { type: 'ENEMY_DAMAGED'; enemy: any; damage: number; source: any }
    | { type: 'PLAYER_DAMAGED'; amount: number; source: any }
    | { type: 'WEAPON_FIRED'; weapon: any }
    | { type: 'PROJECTILE_HIT'; projectile: any; enemy: any }
    | { type: 'ZONE_TICK'; zone: any; enemies: any[] }
    | { type: 'LEVEL_UP'; player: any; newLevel: number }
    | { type: 'XP_COLLECTED'; crystal: any; value: number }
    | { type: 'STATE_CHANGED'; from: string; to: string };

// Extract event type string literals
type EventType = GameEvent['type'];

// Extract specific event by type
type EventByType<T extends EventType> = Extract<GameEvent, { type: T }>;

// Handler type for a specific event
type EventHandler<T extends EventType> = (event: EventByType<T>) => void;

// ============================================
// EVENT BUS CLASS
// ============================================
class EventBus {
    private listeners = new Map<EventType, Set<EventHandler<any>>>();

    /**
     * Subscribe to an event type
     * @returns Unsubscribe function
     */
    on<T extends EventType>(type: T, handler: EventHandler<T>): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)!.add(handler);

        // Return unsubscribe function
        return () => this.off(type, handler);
    }

    /**
     * Unsubscribe from an event type
     */
    off<T extends EventType>(type: T, handler: EventHandler<T>): void {
        const handlers = this.listeners.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Emit an event to all subscribers
     */
    emit<T extends GameEvent>(event: T): void {
        const handlers = this.listeners.get(event.type as EventType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(event);
                } catch (error) {
                    console.error(`Error in event handler for ${event.type}:`, error);
                }
            });
        }
    }

    /**
     * Clear all listeners (useful for testing)
     */
    clear(): void {
        this.listeners.clear();
    }

    /**
     * Get listener count for a type (useful for debugging)
     */
    listenerCount(type: EventType): number {
        return this.listeners.get(type)?.size ?? 0;
    }
}

// Singleton instance
export const events = new EventBus();

// Export class for testing
export { EventBus };
