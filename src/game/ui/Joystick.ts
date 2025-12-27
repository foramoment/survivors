import type { Vector2 } from '../core/Utils';

export class Joystick {
    container: HTMLElement;
    stick: HTMLElement;
    base: HTMLElement;

    active: boolean = false;
    origin: Vector2 = { x: 0, y: 0 };
    currentPos: Vector2 = { x: 0, y: 0 };
    vector: Vector2 = { x: 0, y: 0 };

    maxRadius: number = 50;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'joystick-container';

        this.base = document.createElement('div');
        this.base.className = 'joystick-base';

        this.stick = document.createElement('div');
        this.stick.className = 'joystick-stick';

        this.base.appendChild(this.stick);
        this.container.appendChild(this.base);
        document.getElementById('ui-layer')?.appendChild(this.container);

        this.setupEvents();
    }

    setupEvents() {
        // Touch events on the entire screen to allow placing joystick anywhere or fixed area
        // For this implementation, we'll use a fixed area on the left side of the screen
        const touchZone = document.createElement('div');
        touchZone.id = 'joystick-zone';
        document.body.appendChild(touchZone);

        touchZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.start(touch.clientX, touch.clientY);
        }, { passive: false });

        touchZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.move(touch.clientX, touch.clientY);
        }, { passive: false });

        touchZone.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.end();
        });
    }

    start(x: number, y: number) {
        this.active = true;
        this.origin = { x, y };
        this.currentPos = { x, y };

        this.base.style.display = 'block';
        this.base.style.left = `${x}px`;
        this.base.style.top = `${y}px`;
        this.stick.style.transform = `translate(-50%, -50%)`;

        this.updateVector();
    }

    move(x: number, y: number) {
        if (!this.active) return;

        this.currentPos = { x, y };

        const dx = x - this.origin.x;
        const dy = y - this.origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > this.maxRadius) {
            const angle = Math.atan2(dy, dx);
            this.currentPos.x = this.origin.x + Math.cos(angle) * this.maxRadius;
            this.currentPos.y = this.origin.y + Math.sin(angle) * this.maxRadius;
        }

        const stickX = this.currentPos.x - this.origin.x;
        const stickY = this.currentPos.y - this.origin.y;

        this.stick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

        this.updateVector();
    }

    end() {
        this.active = false;
        this.vector = { x: 0, y: 0 };
        this.base.style.display = 'none';
    }

    updateVector() {
        const dx = this.currentPos.x - this.origin.x;
        const dy = this.currentPos.y - this.origin.y;

        // Normalize vector to -1..1
        this.vector.x = dx / this.maxRadius;
        this.vector.y = dy / this.maxRadius;
    }

    getVector(): Vector2 {
        return this.vector;
    }
}
