import { type Vector2 } from './Utils';

export class Input {
    keys: { [key: string]: boolean } = {};
    mousePos: Vector2 = { x: 0, y: 0 };
    isMouseDown: boolean = false;

    constructor() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        });
        window.addEventListener('mousedown', () => {
            this.isMouseDown = true;
        });
        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });
    }

    getAxis(): Vector2 {
        const axis = { x: 0, y: 0 };
        if (this.keys['KeyW'] || this.keys['ArrowUp']) axis.y -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) axis.y += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) axis.x -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) axis.x += 1;
        return axis;
    }
}

export const input = new Input();
