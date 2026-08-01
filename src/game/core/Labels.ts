/**
 * LABELS — display text for game data.
 *
 * Every screen that shows a weapon / class / powerup / stage goes through here
 * instead of reading `.name` directly, so a translation is one lookup and the
 * English source of truth stays in GameData / StageData (passed in as the
 * fallback — see core/I18n).
 */

import { tf } from './I18n';

interface WithId { id: string }

interface WeaponLike extends WithId {
    name: string;
    description: string;
    evolution: { name: string; description: string };
}

interface ClassLike extends WithId { name: string; bonus: string }
interface PowerupLike extends WithId { name: string; description: string }
interface StageLike extends WithId { name: string; description: string }

export const weaponName = (w: WeaponLike) => tf(`weapon.${w.id}.name`, w.name);
export const weaponDesc = (w: WeaponLike) => tf(`weapon.${w.id}.desc`, w.description);
export const weaponEvoName = (w: WeaponLike) => tf(`weapon.${w.id}.evoName`, w.evolution.name);
export const weaponEvoDesc = (w: WeaponLike) => tf(`weapon.${w.id}.evoDesc`, w.evolution.description);

export const classLabel = (c: ClassLike) => tf(`class.${c.id}.name`, c.name);
export const classBonus = (c: ClassLike) => tf(`class.${c.id}.bonus`, c.bonus);

export const powerupName = (p: PowerupLike) => tf(`powerup.${p.id}.name`, p.name);
export const powerupDesc = (p: PowerupLike) => tf(`powerup.${p.id}.desc`, p.description);

export const stageName = (s: StageLike) => tf(`stage.${s.id}.name`, s.name);
export const stageDesc = (s: StageLike) => tf(`stage.${s.id}.desc`, s.description);
