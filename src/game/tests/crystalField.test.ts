import { describe, it, expect, vi } from 'vitest';

vi.mock('../../engine/AudioSystem', () => ({
    audio: { play: vi.fn() },
}));
// SpriteFactory paints on a canvas at import time
vi.mock('../core/SpriteFactory', () => ({
    sprites: { getCrystalSprite: () => ({}) },
}));

import { CrystalField, type CrystalAttractor } from '../entities/CrystalField';

/** Just enough Player for the field: a position, a magnet and a hitbox */
function makePlayer(x: number, y: number, magnet: number) {
    return {
        pos: { x, y },
        radius: 12,
        stats: { magnet },
        gainXp: vi.fn(),
    } as any;
}

function hole(x: number, y: number, crystalPull: number): CrystalAttractor {
    return { pos: { x, y }, crystalPull };
}

/** One second of frames at the field's real timestep */
function run(field: CrystalField, player: any, attractors: CrystalAttractor[], seconds: number) {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
        field.update(dt, player, 1920, 1080, attractors);
    }
}

describe('Crystals and gravity wells', () => {
    it('drags loose crystals into the well', () => {
        const field = CrystalFieldWith([{ x: 300, y: 0, value: 1 }]);
        const player = makePlayer(0, 0, 0);

        run(field, player, [hole(320, 0, 400)], 1);

        const crystal = only(field);
        // Heaped just short of the centre, not stacked on it
        expect(Math.hypot(crystal.pos.x - 320, crystal.pos.y)).toBeLessThan(20);
    });

    it('leaves crystals outside the well alone', () => {
        const field = CrystalFieldWith([{ x: 900, y: 0, value: 1 }]);
        const player = makePlayer(0, 0, 0);

        run(field, player, [hole(320, 0, 400)], 1);

        expect(only(field).pos.x).toBe(900);
    });

    it('never tows a crystal out of the player\'s magnet', () => {
        // The hole is dropped at the player's feet, which is exactly where the
        // Warden wants to stand — it must not fight him for his own pickups
        const field = CrystalFieldWith([{ x: 60, y: 0, value: 1 }]);
        const player = makePlayer(0, 0, 100);

        run(field, player, [hole(400, 0, 500)], 0.2);

        // Moved toward the player, not toward the hole
        expect(only(field).pos.x).toBeLessThan(60);
    });
});

/** Build a field holding exactly the given crystals */
function CrystalFieldWith(spawns: { x: number; y: number; value: number }[]): CrystalField {
    const field = new CrystalField();
    for (const s of spawns) field.spawn(s.x, s.y, s.value);
    return field;
}

/** The single crystal in a one-crystal field */
function only(field: CrystalField): any {
    return (field as any).crystals[0];
}
