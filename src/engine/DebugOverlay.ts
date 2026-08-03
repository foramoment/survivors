/**
 * DEBUG OVERLAY
 * Shows FPS and debug information when enabled.
 * Singleton for easy access.
 */

export interface DebugStats {
    enemies: number;
    particles: number;
    projectiles: number;
}

class DebugOverlayClass {
    private fps: number = 0;
    private frameCount: number = 0;
    private fpsTimer: number = 0;

    enabled: boolean = false;
    private stats: DebugStats = { enemies: 0, particles: 0, projectiles: 0 };

    /**
     * Call every frame to track FPS
     */
    update(dt: number) {
        this.frameCount++;
        this.fpsTimer += dt;

        if (this.fpsTimer >= 1.0) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsTimer = 0;
        }
    }

    /**
     * Update stats for display
     */
    setStats(stats: Partial<DebugStats>) {
        Object.assign(this.stats, stats);
    }

    /**
     * Draw the overlay (call at the end of draw loop)
     */
    draw(ctx: CanvasRenderingContext2D) {
        if (!this.enabled) return;

        // Top-right corner
        const x = ctx.canvas.width - 190;
        const y = 10;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, 180, 90);

        ctx.fillStyle = this.fps >= 55 ? '#00ff00' : this.fps >= 30 ? '#ffff00' : '#ff0000';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';

        ctx.fillText(`FPS: ${this.fps}`, x + 10, y + 22);

        ctx.fillStyle = '#00ff00';
        ctx.fillText(`Enemies: ${this.stats.enemies}`, x + 10, y + 42);
        ctx.fillText(`Particles: ${this.stats.particles}`, x + 10, y + 62);
        ctx.fillText(`Projectiles: ${this.stats.projectiles}`, x + 10, y + 82);

        ctx.restore();
    }

    getFps(): number {
        return this.fps;
    }
}

export const debugOverlay = new DebugOverlayClass();
