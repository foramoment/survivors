/**
 * LIGHTNING CHAIN WEAPON
 * Lightning that chains between enemies.
 * 
 * Evolved: Thunderstorm - Infinite chain with split chance
 */
import { ProjectileWeapon, ChainLightning, Beam } from '../base';
import { Entity } from '../../Entity';
import { distance } from '../../core/Utils';
import { ThunderstormLightning } from '../EvolutionTypes';
import { particles } from '../../core/ParticleSystem';
import { WEAPON_STATS } from '../../data/GameData';
import { damageSystem } from '../../core/DamageSystem';

function getStats(weaponId: string) {
    return WEAPON_STATS[weaponId] || {
        damage: 10, cooldown: 1.0, area: 100, duration: 1.0, pierce: 5
    };
}

export class LightningChainWeapon extends ProjectileWeapon {
    name = "Lightning Chain";
    emoji = "⚡";
    description = "Lightning that chains between enemies.";
    projectileEmoji = "⚡";
    pierce = 3;
    private stats = getStats('lightning_chain');
    private activeChain: ChainLightning | ThunderstormLightning | null = null;
    private waitingForChainComplete: boolean = false;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = 0;
        this.duration = this.stats.duration;
    }

    update(dt: number, enemies: Entity[]) {
        const isEvolved = this.evolved;

        if (isEvolved && this.waitingForChainComplete) {
            if (this.activeChain && this.activeChain.isDead) {
                this.waitingForChainComplete = false;
                this.activeChain = null;
            }
            return;
        }

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = this.area * (this.owner as any).stats.area;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                this.fire(target);
                const cdMultiplier = isEvolved ? 1.5 : 1.0;
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown * cdMultiplier;
            }
        }
    }

    fire(target: any) {
        const isEvolved = this.evolved;

        // Use DamageSystem for initial hit
        const result = damageSystem.dealDamage({
            baseDamage: this.damage,
            source: this,
            target: target,
            position: target.pos
        });
        particles.emitLightning(target.pos.x, target.pos.y);

        const beamColor = isEvolved ? '#aa00ff' : '#ffff00';
        const beam = new Beam(this.owner.pos, target.pos, 0.1, beamColor, isEvolved ? 3 : 2);
        this.onSpawn(beam);

        const bounces = isEvolved ? 999 : (this.stats.pierce || 5) + this.level;
        const maxChainLength = isEvolved ? 10000 : this.stats.area;

        let chain: ChainLightning | ThunderstormLightning;
        if (isEvolved) {
            const thunder = new ThunderstormLightning(target.pos.x, target.pos.y, result.finalDamage, bounces, maxChainLength);
            thunder.splitChance = 0.1;
            thunder.onAllChainsComplete = () => {
                this.waitingForChainComplete = false;
            };
            chain = thunder;
            this.activeChain = chain;
            this.waitingForChainComplete = true;
        } else {
            chain = new ChainLightning(target.pos.x, target.pos.y, result.finalDamage, bounces, maxChainLength);
        }

        chain.hitEnemies.add(target);
        // Chain hits use DamageSystem too
        chain.onHit = (t: any, d: number) => {
            damageSystem.dealDamage({
                baseDamage: d / ((this.owner as any).stats?.might || 1), // Undo might since DamageSystem applies it
                source: this,
                target: t,
                position: t.pos
            });
            particles.emitLightning(t.pos.x, t.pos.y);
        };

        this.onSpawn(chain);
    }

    // Uses base class upgrade() with damageScaling
}
