import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../core/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import {
    biteDamage, ARMOR_FLOOR, BITE_INTERVAL, BITE_PUNCH, MAX_BITERS,
} from '../core/ContactDamage';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { ENEMIES, ENEMY_CONFIG } from '../data/GameData';
import { DifficultyDirector } from '../core/DifficultyDirector';

/** What a ring of `n` enemies of this DPS costs per second, at the biter cap */
function crowdDps(dps: number, n: number, armor: number): number {
    const biters = Math.min(n, MAX_BITERS);
    return (biteDamage(dps, armor) * biters) / BITE_INTERVAL;
}

describe('biteDamage', () => {
    it('lands as a chunk, not a trickle', () => {
        // The whole reason for the rework: a bite has to be big enough to
        // register as an event. 0.3 HP per frame is weather, not damage.
        expect(biteDamage(10, 0)).toBeCloseTo(10 * BITE_INTERVAL * BITE_PUNCH);
        expect(biteDamage(10, 0)).toBeGreaterThan(5);
    });

    it('armor reduces every bite, so it scales with crowd size', () => {
        const bare = biteDamage(10, 0);
        const armored = biteDamage(10, 4);
        expect(armored).toBeCloseTo(bare - 4);
    });

    it('armor never grants immunity', () => {
        const bite = biteDamage(10, 999);
        expect(bite).toBeCloseTo(10 * BITE_INTERVAL * BITE_PUNCH * ARMOR_FLOOR);
        expect(bite).toBeGreaterThan(0);
    });

    it('negative armor (Berserker) hurts more', () => {
        expect(biteDamage(10, -2)).toBeCloseTo(10 * BITE_INTERVAL * BITE_PUNCH + 2);
    });
});

describe('crowd scaling', () => {
    it('crowds stack linearly up to the biter cap', () => {
        const one = crowdDps(10, 1, 0);
        const four = crowdDps(10, 4, 0);
        expect(four).toBeCloseTo(one * 4);
    });

    it('caps at how many bodies fit against you, not at a damage multiple', () => {
        const full = crowdDps(10, MAX_BITERS, 0);
        const pile = crowdDps(10, 40, 0);
        expect(pile).toBeCloseTo(full);
    });

    it('being surrounded is far worse than being grazed', () => {
        // This is the number that failed in play: under the old model a
        // hundred enemies cost the same as four, and a player stood in the
        // middle of the arena for ten minutes.
        expect(crowdDps(10, MAX_BITERS, 0) / crowdDps(10, 1, 0)).toBeCloseTo(MAX_BITERS);
    });
});

describe('Enemy bite timer', () => {
    it('each enemy carries its own, so a crowd is not gated by one clock', () => {
        const a = new Enemy(0, 0, ENEMIES[0]);
        const b = new Enemy(0, 0, ENEMIES[0]);
        a.biteTimer = 0;
        b.biteTimer = BITE_INTERVAL;
        expect(a.biteTimer).not.toBe(b.biteTimer);
    });

    it('ticks down even while stunned, so a stun is not a free bite later', () => {
        const enemy = new Enemy(0, 0, ENEMIES[0]);
        enemy.biteTimer = BITE_INTERVAL;
        enemy.stunTimer = 10;
        enemy.update(0.5);
        expect(enemy.biteTimer).toBeCloseTo(BITE_INTERVAL - 0.5);
    });
});

describe('Player bites', () => {
    it('ignores i-frames — that bug is what made crowds free', () => {
        const player = new Player(0, 0);
        player.hp = 100;

        // A discrete hit (a meteor) grants invulnerability...
        player.takeDamage(10);
        expect(player.invulnerabilityTimer).toBeGreaterThan(0);

        // ...which must NOT protect against enemies chewing on you
        const before = player.hp;
        player.takeBite(12);
        expect(player.hp).toBeCloseTo(before - 12);
    });

    it('kills the player when HP runs out', () => {
        const player = new Player(0, 0);
        player.hp = 5;
        player.takeBite(20);
        expect(player.hp).toBe(0);
        expect(player.isDead).toBe(true);
    });

    it('a discrete hit still respects i-frames', () => {
        const player = new Player(0, 0);
        player.hp = 100;
        player.takeDamage(10);
        player.takeDamage(10);
        expect(player.hp).toBeCloseTo(90);
    });
});

describe('contact damage balance', () => {
    /** Enemy contact DPS at a given run time, as GameManager builds it */
    function enemyDps(tierIndex: number, gameTime: number, intensity: number): number {
        const director = new DifficultyDirector();
        director.intensity = intensity;
        return ENEMIES[tierIndex].damage * director.getDamageMultiplier(gameTime);
    }

    it('the enemy damage curve stays inside a survivable band', () => {
        const last = ENEMIES[ENEMIES.length - 1].damage;
        expect(ENEMY_CONFIG.damageMultiplier).toBeLessThan(1.3);
        expect(last).toBeLessThan(50);
    });

    it('a single early enemy is a scratch, not a threat', () => {
        const dps = crowdDps(enemyDps(0, 30, 1), 1, 0);
        // A fresh 90-100 HP player survives well over ten seconds of contact
        expect(90 / dps).toBeGreaterThan(10);
    });

    it('standing in a late-game crowd kills in seconds', () => {
        const dps = crowdDps(enemyDps(6, 600, 2), MAX_BITERS, 0);
        const hp = 300; // a player who has taken a few Barrier Field stacks
        expect(hp / dps).toBeLessThan(4);
        expect(hp / dps).toBeGreaterThan(1); // still time to walk out
    });

    it('armor is worth taking against a crowd', () => {
        const dps = enemyDps(3, 240, 1.5);
        const bare = crowdDps(dps, 5, 0);
        const armored = crowdDps(dps, 5, 8);
        expect(1 - armored / bare).toBeGreaterThan(0.2);
    });
});
