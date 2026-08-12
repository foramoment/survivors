/**
 * WEAPON BASE CLASSES - Central re-export point
 * 
 * Import from this file for cleaner imports:
 *   import { Projectile, Zone, Beam } from './base';
 */

// Projectile types
export {
    Projectile,
    BouncingProjectile,
    SingularityProjectile,
    PlasmaProjectile,
    OrbitingProjectile,
    LobbedProjectile,
    Nanobot,
    holdOnShell
} from './Projectile';

// Zone types
export {
    Zone,
    FrostZone,
    AcidZone,
    BurningTrailZone,
    SporeZone,
    NanobotCloud,
    DelayedExplosionZone,
    MindBlastZone,
    PlasmaExplosionZone,
    SPORE_DEATH_EXTEND
} from './Zone';

// Beam types
export {
    Beam,
    ChainLightning
} from './Beam';

// Abstract weapon classes
export {
    ProjectileWeapon,
    ZoneWeapon
} from './WeaponBase';

export type { ProjectileParams } from './WeaponBase';
