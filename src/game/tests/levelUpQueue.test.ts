import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Input builds the joystick at module load, before any of the fakes below
vi.mock('../../engine/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

/**
 * A pile of crystals gathered by a black hole is collected in ONE frame:
 * `CrystalField` walks its whole list and every pickup can level the player.
 * The overlay used to build a panel per level and stack them in `uiLayer`;
 * taking a card removed only that panel and handed the world back, so the
 * player went on choosing from the panels underneath while the crowd walked in
 * and killed them. Reported from a real Void Nexus run.
 *
 * These tests are about ONE property: the world stays frozen until the last
 * queued level has been spent.
 *
 * The `node` environment has no DOM, and pulling in jsdom for a single screen
 * is a heavier dependency than the fake below — which only has to be as real as
 * the overlay's own usage.
 */

// ---------------------------------------------------------------- fake DOM

class FakeEl {
    children: FakeEl[] = [];
    parent: FakeEl | null = null;
    classes = new Set<string>();
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    textContent = '';
    innerHTML = '';
    title = '';
    disabled = false;
    onclick: (() => void) | null = null;
    private listeners = new Map<string, Array<() => void>>();

    tag: string;

    constructor(tag: string) { this.tag = tag; }

    get className() { return [...this.classes].join(' '); }
    set className(v: string) { this.classes = new Set(v.split(' ').filter(Boolean)); }

    readonly classList = {
        add: (...c: string[]) => c.forEach(x => this.classes.add(x)),
        remove: (...c: string[]) => c.forEach(x => this.classes.delete(x)),
        contains: (c: string) => this.classes.has(c),
        toggle: (c: string, on?: boolean) => (on ? this.classes.add(c) : this.classes.delete(c)),
    };

    appendChild(child: FakeEl) {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (!this.parent) return;
        this.parent.children = this.parent.children.filter(c => c !== this);
        this.parent = null;
    }

    setAttribute(_k: string, _v: string) { /* svg only */ }
    querySelectorAll(_sel: string) { return [] as FakeEl[]; }
    addEventListener(type: string, fn: () => void) {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }
    click() { this.onclick?.(); }

    /** Every descendant carrying a class, in document order */
    findAll(cls: string): FakeEl[] {
        const out: FakeEl[] = [];
        if (this.classes.has(cls)) out.push(this);
        for (const c of this.children) out.push(...c.findAll(cls));
        return out;
    }
}

let keyHandlers: Array<(e: any) => void> = [];

beforeAll(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, String(v)),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        },
    });

    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            createElement: (tag: string) => new FakeEl(tag),
            createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
            getElementById: () => null,
        },
    });

    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            addEventListener: (type: string, fn: (e: any) => void) => {
                if (type === 'keydown') keyHandlers.push(fn);
            },
            removeEventListener: (type: string, fn: (e: any) => void) => {
                if (type === 'keydown') keyHandlers = keyHandlers.filter(h => h !== fn);
            },
        },
    });
});

import { LevelUpOverlay, type LevelUpHost } from '../ui/screens/LevelUpOverlay';
import { Player } from '../entities/Player';
import type { GameState } from '../core/StateMachine';

// ---------------------------------------------------------------- fake host

function makeHost() {
    const uiLayer = new FakeEl('div');
    const player = new Player(0, 0);
    const picks: string[] = [];

    const host: LevelUpHost & { uiLayer: FakeEl } = {
        uiLayer: uiLayer as any,
        player,
        weaponLevels: new Map([['void_bolt', 1]]),
        powerupLevels: new Map(),
        devMode: false,
        state: 'PLAYING' as GameState,
        addWeapon: (id: string) => picks.push(`weapon:${id}`),
        addEvolvedWeapon: (id: string) => picks.push(`evo:${id}`),
        applyPowerup: (p: any) => picks.push(`perk:${p.name}`),
    };

    return { host, uiLayer, player, picks };
}

/** Panels currently on screen */
function panels(uiLayer: FakeEl) {
    return uiLayer.findAll('level-up-screen');
}

/** Take the focused card the way a player does: space on the keyboard */
function pickFocused() {
    const handler = keyHandlers[keyHandlers.length - 1];
    expect(handler, 'a panel should own the keyboard while it is up').toBeTruthy();
    handler({ code: 'Space', preventDefault: () => { } });
    // Picks resolve 160ms late so the chosen card can flash
    vi.advanceTimersByTime(200);
}

describe('level-up queue', () => {
    beforeEach(() => {
        keyHandlers = [];
        vi.useFakeTimers();
    });

    it('several levels in one frame put up one panel, not a stack', () => {
        const { host, uiLayer } = makeHost();
        const overlay = new LevelUpOverlay(host);

        // Five crystals from the pile, all in the same frame
        for (let i = 0; i < 5; i++) overlay.show();

        expect(panels(uiLayer).length).toBe(1);
        expect(host.state).toBe('LEVEL_UP');
    });

    it('the world stays frozen until the last queued level is spent', () => {
        const { host, uiLayer, picks } = makeHost();
        const overlay = new LevelUpOverlay(host);

        for (let i = 0; i < 3; i++) overlay.show();

        // Two picks: still a panel up, still frozen. This is the bug — the old
        // code went back to PLAYING on the first pick with two panels left.
        pickFocused();
        expect(host.state).toBe('LEVEL_UP');
        expect(panels(uiLayer).length).toBe(1);

        pickFocused();
        expect(host.state).toBe('LEVEL_UP');
        expect(panels(uiLayer).length).toBe(1);

        // Third pick empties the queue
        pickFocused();
        expect(host.state).toBe('PLAYING');
        expect(panels(uiLayer).length).toBe(0);
        expect(picks.length).toBe(3);
    });

    it('a panel is never on screen while the world is running', () => {
        const { host, uiLayer } = makeHost();
        const overlay = new LevelUpOverlay(host);

        for (let i = 0; i < 4; i++) overlay.show();
        for (let i = 0; i < 4; i++) {
            pickFocused();
            const running = host.state === 'PLAYING';
            expect(running && panels(uiLayer).length > 0).toBe(false);
        }
    });

    it('a restart drops the queue instead of banking it into the next run', () => {
        const { host, uiLayer } = makeHost();
        const overlay = new LevelUpOverlay(host);

        for (let i = 0; i < 4; i++) overlay.show();
        overlay.detach();
        expect(panels(uiLayer).length).toBe(0);
        expect(keyHandlers.length).toBe(0);

        // The next run's first level-up must be a normal, single panel
        overlay.show();
        expect(panels(uiLayer).length).toBe(1);
        pickFocused();
        expect(host.state).toBe('PLAYING');
    });
});

describe('gainXp pays out every level it was paid for', () => {
    it('a single huge pickup levels as many times as it bought', () => {
        const player = new Player(0, 0);
        let levels = 0;
        player.onLevelUp = () => { levels++; };

        // One crystal off a black-hole pile is worth many levels; the old `if`
        // granted exactly one and left the rest in the bank until enough
        // further crystals happened to be walked over.
        player.gainXp(500);

        expect(levels).toBeGreaterThan(5);
        expect(player.xp).toBeLessThan(player.nextLevelXp);
    });
});
