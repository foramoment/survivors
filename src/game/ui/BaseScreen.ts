/**
 * BASE SCREEN - Abstract class for all game screens
 * 
 * Lifecycle:
 *   1. enter(params?) - Called when navigating TO this screen
 *   2. update(dt) / draw(ctx) - Game loop (optional for static screens)
 *   3. exit() - Called when navigating AWAY from this screen
 * 
 * Screen implementations should:
 *   - Create DOM elements in enter()
 *   - Clean up DOM elements in exit()
 *   - Use this.uiLayer for DOM manipulation
 */

export interface ScreenParams {
    [key: string]: any;
}

export abstract class BaseScreen {
    protected uiLayer: HTMLElement;
    protected canvas: HTMLCanvasElement;
    protected ctx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.uiLayer = document.getElementById('ui-layer')!;
    }

    /**
     * Called when transitioning TO this screen.
     * Create DOM elements, set up event listeners, etc.
     */
    abstract enter(params?: ScreenParams): void;

    /**
     * Called when transitioning AWAY from this screen.
     * Clean up DOM elements, remove event listeners, etc.
     */
    abstract exit(): void;

    /**
     * Called every frame. Override for screens that need game loop updates.
     * @param dt Delta time in seconds
     */
    update(_dt: number): void {
        // Default: no update logic
    }

    /**
     * Called every frame for Canvas rendering. Override if needed.
     * Note: DOM-based screens may not need this.
     */
    draw(_ctx: CanvasRenderingContext2D): void {
        // Default: no canvas drawing
    }

    /**
     * Clear the UI layer (useful in enter/exit)
     */
    protected clearUI(): void {
        this.uiLayer.innerHTML = '';
    }
}
