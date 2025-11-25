export interface Vector2 {
    x: number;
    y: number;
}

export const distance = (a: Vector2, b: Vector2): number => {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
};

export const normalize = (v: Vector2): Vector2 => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
};

export const checkCollision = (
    a: { pos: Vector2; radius: number },
    b: { pos: Vector2; radius: number }
): boolean => {
    return distance(a.pos, b.pos) < a.radius + b.radius;
};

export const randomRange = (min: number, max: number): number => {
    return Math.random() * (max - min) + min;
};
