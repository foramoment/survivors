import { GameManager } from '../GameManager';

export class Engine {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    gameManager: GameManager;
    lastTime: number = 0;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.gameManager = new GameManager(this.canvas, this.ctx);

        // Start loop
        requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    loop(timestamp: number) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Cap dt to prevent huge jumps if tab is inactive
        const safeDt = Math.min(dt, 0.1);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background (simple grid or space)
        this.drawBackground();

        this.gameManager.update(safeDt);
        this.gameManager.draw(this.ctx);

        requestAnimationFrame((t) => this.loop(t));
    }

    drawBackground() {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid relative to camera (handled in GameManager usually, but for now simple static or moving grid)
        // We'll let GameManager handle the world rendering including background to support camera movement
    }
}
