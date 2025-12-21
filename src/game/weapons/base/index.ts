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
    Nanobot
} from './Projectile';

// Zone types
export {
    Zone,
    FrostZone,
    AcidZone,
    SporeZone,
    NanobotCloud,
    DelayedExplosionZone,
    MindBlastZone
} from './Zone';

// Beam types
export {
    Beam,
    VoidRayBeam,
    ChainLightning
} from './Beam';

// Abstract weapon classes
export {
    ProjectileWeapon,
    ZoneWeapon
} from './WeaponBase';
