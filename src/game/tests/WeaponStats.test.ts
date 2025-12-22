import { describe, it, expect } from 'vitest';
import { VoidRayWeapon } from '../weapons/implementations/VoidRayWeapon';
import { PhantomSlashWeapon } from '../weapons/implementations/PhantomSlashWeapon';
import { PlasmaCannonWeapon } from '../weapons/implementations/PlasmaCannonWeapon';
import { NanobotSwarmWeapon } from '../weapons/implementations/NanobotSwarmWeapon';
import { SporeCloudWeapon } from '../weapons/implementations/SporeCloudWeapon';
import { SingularityOrbWeapon } from '../weapons/implementations/SingularityOrbWeapon';
import { OrbitalStrikeWeapon } from '../weapons/implementations/OrbitalStrikeWeapon';
import { MindBlastWeapon } from '../weapons/implementations/MindBlastWeapon';
import { ChronoDiscWeapon } from '../weapons/implementations/ChronoDiscWeapon';
import { AcidPoolWeapon } from '../weapons/implementations/AcidPoolWeapon';
import { LightningChainWeapon } from '../weapons/implementations/LightningChainWeapon';
import { SpinningEmberWeapon } from '../weapons/implementations/SpinningEmberWeapon';
import { FrostNovaWeapon } from '../weapons/implementations/FrostNovaWeapon';
import { FanOfKnivesWeapon } from '../weapons/implementations/FanOfKnivesWeapon';

const EXPECTED_STATS: Record<string, any> = {
    void_ray: {
        damage: 25,
        cooldown: 2.0,
        area: 1,
        speed: 0,
        duration: 0.5,
    },
    phantom_slash: {
        damage: 15,
        cooldown: 1.5,
        area: 250,
        speed: 0,
        duration: 0.2,
        count: 3,
        countScaling: 1,
    },
    plasma_cannon: {
        damage: 40,
        cooldown: 2.5,
        area: 150,
        speed: 300,
        duration: 3,
    },
    nanobot_swarm: {
        damage: 0.8,
        cooldown: 0.5,
        area: 1.0,
        speed: 0,
        duration: 5,
    },
    spore_cloud: {
        damage: 10,
        cooldown: 2,
        area: 50,
        speed: 0,
        duration: 5,
    },
    singularity_orb: {
        damage: 50,
        cooldown: 4.0,
        area: 600,
        speed: 50,
        duration: 2.5,
        pierce: 999,
    },
    orbital_strike: {
        damage: 40,
        cooldown: 2.0,
        area: 100,
        speed: 0,
        duration: 1.0,
    },
    mind_blast: {
        damage: 20,
        cooldown: 3,
        area: 120,
        speed: 0,
        duration: 0.5,
    },
    chrono_disc: {
        damage: 25,
        cooldown: 2.5,
        area: 400,
        speed: 500,
        duration: 5,
        pierce: 5,
        count: 1,
        countScaling: 1,
    },
    acid_pool: {
        damage: 10,
        cooldown: 2.0,
        area: 80,
        speed: 0,
        duration: 3.0,
    },
    lightning_chain: {
        damage: 25,
        cooldown: 1.8,
        area: 800,
        speed: 0,
        duration: 0.3,
        pierce: 5,
    },
    spinning_ember: {
        damage: 15,
        cooldown: 3.0,
        area: 100,
        speed: 3,
        duration: 4,
        count: 2,
        countScaling: 1,
    },
    frost_nova: {
        damage: 8,
        cooldown: 2.5,
        area: 120,
        speed: 0,
        duration: 3.0,
    },
    fan_of_knives: {
        damage: 12,
        cooldown: 1.5,
        area: 0,
        speed: 700,
        duration: 1.5,
        pierce: 2,
        count: 3,
        countScaling: 0.5,
    },
};

describe('Weapon Stats Safety Net', () => {
    const mockOwner = {
        pos: { x: 0, y: 0 },
        stats: {
            damage: 1,
            cooldown: 1,
            area: 1,
            speed: 1,
            duration: 1,
            amount: 1,
            moveSpeed: 1,
            magnet: 1,
            luck: 1
        },
        getDamage: (d: number) => ({ damage: d, isCrit: false })
    };

    it('Void Ray Stats', () => {
        const weapon = new VoidRayWeapon(mockOwner);
        const expected = EXPECTED_STATS.void_ray;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Phantom Slash Stats', () => {
        const weapon = new PhantomSlashWeapon(mockOwner);
        const expected = EXPECTED_STATS.phantom_slash;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Plasma Cannon Stats', () => {
        const weapon = new PlasmaCannonWeapon(mockOwner);
        const expected = EXPECTED_STATS.plasma_cannon;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Nanobot Swarm Stats', () => {
        const weapon = new NanobotSwarmWeapon(mockOwner);
        const expected = EXPECTED_STATS.nanobot_swarm;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
    });

    it('Spore Cloud Stats', () => {
        const weapon = new SporeCloudWeapon(mockOwner);
        const expected = EXPECTED_STATS.spore_cloud;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Singularity Orb Stats', () => {
        const weapon = new SingularityOrbWeapon(mockOwner);
        const expected = EXPECTED_STATS.singularity_orb;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Orbital Strike Stats', () => {
        const weapon = new OrbitalStrikeWeapon(mockOwner);
        const expected = EXPECTED_STATS.orbital_strike;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Mind Blast Stats', () => {
        const weapon = new MindBlastWeapon(mockOwner);
        const expected = EXPECTED_STATS.mind_blast;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Chrono Disc Stats', () => {
        const weapon = new ChronoDiscWeapon(mockOwner);
        const expected = EXPECTED_STATS.chrono_disc;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Acid Pool Stats', () => {
        const weapon = new AcidPoolWeapon(mockOwner);
        const expected = EXPECTED_STATS.acid_pool;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Lightning Chain Stats', () => {
        const weapon = new LightningChainWeapon(mockOwner);
        const expected = EXPECTED_STATS.lightning_chain;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
    });

    it('Spinning Ember Stats', () => {
        const weapon = new SpinningEmberWeapon(mockOwner);
        const expected = EXPECTED_STATS.spinning_ember;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
    });

    it('Frost Nova Stats', () => {
        const weapon = new FrostNovaWeapon(mockOwner);
        const expected = EXPECTED_STATS.frost_nova;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });

    it('Fan of Knives Stats', () => {
        const weapon = new FanOfKnivesWeapon(mockOwner);
        const expected = EXPECTED_STATS.fan_of_knives;
        expect(weapon.damage).toBe(expected.damage);
        expect(weapon.baseCooldown).toBe(expected.cooldown);
        expect(weapon.area).toBe(expected.area);
    });
});
