import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
    let bus: EventBus;

    beforeEach(() => {
        bus = new EventBus();
    });

    it('should emit events to subscribers', () => {
        let received = false;
        bus.on('ENEMY_DIED', () => {
            received = true;
        });

        bus.emit({ type: 'ENEMY_DIED', enemy: {}, pos: { x: 0, y: 0 }, xpValue: 10 });

        expect(received).toBe(true);
    });

    it('should pass event data to handler', () => {
        let xpValue = 0;
        bus.on('ENEMY_DIED', (e) => {
            xpValue = e.xpValue;
        });

        bus.emit({ type: 'ENEMY_DIED', enemy: {}, pos: { x: 0, y: 0 }, xpValue: 42 });

        expect(xpValue).toBe(42);
    });

    it('should support multiple subscribers', () => {
        let count = 0;
        bus.on('LEVEL_UP', () => count++);
        bus.on('LEVEL_UP', () => count++);

        bus.emit({ type: 'LEVEL_UP', player: {}, newLevel: 5 });

        expect(count).toBe(2);
    });

    it('should unsubscribe correctly', () => {
        let count = 0;
        const unsubscribe = bus.on('WEAPON_FIRED', () => count++);

        bus.emit({ type: 'WEAPON_FIRED', weapon: {} });
        expect(count).toBe(1);

        unsubscribe();

        bus.emit({ type: 'WEAPON_FIRED', weapon: {} });
        expect(count).toBe(1); // Should not increase
    });

    it('should clear all listeners', () => {
        bus.on('ENEMY_DIED', () => { });
        bus.on('LEVEL_UP', () => { });

        expect(bus.listenerCount('ENEMY_DIED')).toBe(1);
        expect(bus.listenerCount('LEVEL_UP')).toBe(1);

        bus.clear();

        expect(bus.listenerCount('ENEMY_DIED')).toBe(0);
        expect(bus.listenerCount('LEVEL_UP')).toBe(0);
    });

    it('should not throw when emitting with no subscribers', () => {
        expect(() => {
            bus.emit({ type: 'STATE_CHANGED', from: 'MENU', to: 'PLAYING' });
        }).not.toThrow();
    });
});
