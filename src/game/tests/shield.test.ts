/**
 * Kinetic Deflector — the absorb buffer.
 *
 * The rules being guarded are not "does subtraction work". They are the three
 * places where a shield can quietly undo the contact model:
 *
 *   1. It must never refill while something is on you, or standing in a pile
 *      becomes free — the failure that took three redesigns to remove from
 *      contact damage (see core/ContactDamage).
 *   2. It must not touch the standing-still ramp, so a shielded player in a
 *      crowd is still building the multiplier that kills them when it pops.
 *   3. The run's damage-taken total must follow the *health bar*, not the
 *      incoming damage, or the summary reports hits the player never felt.
 */
import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../../engine/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import { Player } from '../entities/Player';
import { POWERUPS } from '../data/GameData';
import { SHIELD_RECHARGE_DELAY, SHIELD_REFILL_TIME } from '../core/Tactics';
import { CONTACT_RAMP_FULL } from '../core/ContactDamage';

/** A player carrying a maxed deflector, buffer full */
function shielded(): Player {
    const perk = POWERUPS.find(p => p.id === 'kinetic_deflector')!;
    const player = new Player(0, 0);
    player.hp = 100;
    player.maxHp = 100;
    player.stats.shield = perk.value * perk.maxStacks;
    player.shield = player.stats.shield;
    return player;
}

/** Run `seconds` of update at a fixed step */
function idle(player: Player, seconds: number, step = 1 / 60): void {
    for (let t = 0; t < seconds; t += step) player.update(step);
}

describe('Kinetic Deflector', () => {
    it('is the 30 HP the card promises, not more', () => {
        const perk = POWERUPS.find(p => p.id === 'kinetic_deflector')!;
        expect(perk.value * perk.maxStacks).toBe(30);
        // Against the smallest class pool in the game (Storm Mage, 75) that is
        // 40% of a health bar. Anything larger stops being a dive tool and
        // starts being a second health bar.
        expect(perk.value * perk.maxStacks).toBeLessThan(75 * 0.5);
    });

    it('soaks contact before health, and reports only what health lost', () => {
        const player = shielded();

        // Fully absorbed: health untouched, and the caller is told nothing
        // landed so no number prints and nothing is added to damage taken
        expect(player.takeContact(20)).toBe(0);
        expect(player.hp).toBe(100);
        expect(player.shield).toBe(10);

        // Overflow spills to health, and only the overflow is reported
        expect(player.takeContact(25)).toBe(15);
        expect(player.hp).toBe(85);
        expect(player.shield).toBe(0);
    });

    it('soaks discrete hazards too — one shield, not one per damage source', () => {
        const player = shielded();
        player.takeDamage(20); // meteor, rift collapse
        expect(player.hp).toBe(100);
        expect(player.shield).toBe(10);
    });

    it('does not refill while damage keeps arriving', () => {
        const player = shielded();
        player.takeContact(30);
        expect(player.shield).toBe(0);

        // Being chewed on: a bite every tenth of a second for well past the
        // recharge delay. This is the "standing in a crowd is free" failure —
        // if the buffer comes back here, the perk has undone contact damage.
        for (let i = 0; i < 60; i++) {
            player.takeContact(0.5);
            idle(player, 0.1);
        }
        expect(player.shield).toBe(0);
    });

    it('refills only after breaking away, and not instantly', () => {
        const player = shielded();
        player.takeContact(30);

        // Still inside the delay — nothing back yet
        idle(player, SHIELD_RECHARGE_DELAY * 0.9);
        expect(player.shield).toBe(0);

        // Part way through the refill, part way back
        idle(player, SHIELD_RECHARGE_DELAY * 0.2 + SHIELD_REFILL_TIME * 0.5);
        expect(player.shield).toBeGreaterThan(0);
        expect(player.shield).toBeLessThan(player.stats.shield);

        idle(player, SHIELD_REFILL_TIME);
        expect(player.shield).toBeCloseTo(player.stats.shield, 5);
    });

    it('one dive per engagement: the delay outlasts a shove out of the pile', () => {
        // The ramp sheds in CONTACT_RAMP_DECAY (1.5s), so a player who jitters
        // in and out of contact on that clock must NOT get the buffer back on
        // the same clock, or hovering at the pile's edge becomes optimal.
        expect(SHIELD_RECHARGE_DELAY).toBeGreaterThan(CONTACT_RAMP_FULL / 2);
        expect(SHIELD_RECHARGE_DELAY + SHIELD_REFILL_TIME).toBeGreaterThan(4);
    });

    it('does not slow the standing-still ramp', () => {
        // The ramp is driven by contact, not by damage reaching health. A
        // shielded player parked in a crowd is buying time, not immunity.
        const player = shielded();
        for (let i = 0; i < 60 * CONTACT_RAMP_FULL; i++) {
            player.updateContactRamp(true, 1 / 60);
            player.takeContact(0.2);
        }
        expect(player.contactRampTime).toBeCloseTo(CONTACT_RAMP_FULL, 3);
    });

    it('blocks regeneration exactly as an unshielded hit would', () => {
        // Absorbed damage is still damage: it has to break the out-of-combat
        // gate, or a shielded player regenerates through a fight.
        const player = shielded();
        player.hp = 50;
        player.stats.regen = 0.05;

        player.takeContact(5); // fully absorbed
        expect(player.regenDelay).toBeGreaterThan(0);
        player.update(1 / 60);
        expect(player.hp).toBe(50);
    });

    it('is inert for a player who never picked it', () => {
        const player = new Player(0, 0);
        player.hp = 100;
        player.maxHp = 100;
        expect(player.takeContact(10)).toBe(10);
        expect(player.hp).toBe(90);

        idle(player, SHIELD_RECHARGE_DELAY + SHIELD_REFILL_TIME + 1);
        expect(player.shield).toBe(0);
    });
});
