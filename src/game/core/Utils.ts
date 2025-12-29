export interface Vector2 {
    x: number;
    y: number;
}

export const distance = (a: Vector2, b: Vector2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const normalize = (v: Vector2): Vector2 => {
    const len = Math.hypot(v.x, v.y);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
};

export const checkCollision = (
    a: { pos: Vector2; radius: number },
    b: { pos: Vector2; radius: number }
): boolean => distance(a.pos, b.pos) < a.radius + b.radius;

export const randomRange = (min: number, max: number): number =>
    Math.random() * (max - min) + min;
