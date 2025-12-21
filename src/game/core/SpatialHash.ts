import { type Vector2 } from './Utils';

/**
 * Spatial Hash Grid for efficient spatial queries
 * Divides space into cells and tracks which entities are in each cell
 * Allows O(1) lookup of nearby entities instead of O(n) full scan
 */
export class SpatialHashGrid<T extends { pos: Vector2; radius: number }> {
    private cellSize: number;
    private cells: Map<string, T[]> = new Map();

    constructor(cellSize: number = 100) {
        this.cellSize = cellSize;
    }

    /**
     * Clear all cells - call at the start of each frame
     */
    clear() {
        this.cells.clear();
    }

    /**
     * Get the cell key for a position
     */
    private getKey(x: number, y: number): string {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }

    /**
     * Insert an entity into the grid
     */
    insert(entity: T) {
        const key = this.getKey(entity.pos.x, entity.pos.y);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = [];
            this.cells.set(key, cell);
        }
        cell.push(entity);
    }

    /**
     * Insert multiple entities at once
     */
    insertAll(entities: T[]) {
        for (const entity of entities) {
            this.insert(entity);
        }
    }

    /**
     * Get all entities in the same cell and neighboring cells
     * Returns entities that MIGHT be colliding (broad phase)
     */
    getNearby(pos: Vector2, radius: number = 0): T[] {
        const result: T[] = [];
        const seen = new Set<T>();

        // Calculate which cells to check based on position and radius
        const minX = Math.floor((pos.x - radius) / this.cellSize);
        const maxX = Math.floor((pos.x + radius) / this.cellSize);
        const minY = Math.floor((pos.y - radius) / this.cellSize);
        const maxY = Math.floor((pos.y + radius) / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x},${y}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const entity of cell) {
                        if (!seen.has(entity)) {
                            seen.add(entity);
                            result.push(entity);
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     * Get entities within a specific radius (narrow phase)
     */
    getWithinRadius(pos: Vector2, radius: number): T[] {
        const candidates = this.getNearby(pos, radius);
        return candidates.filter(entity => {
            const dx = entity.pos.x - pos.x;
            const dy = entity.pos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist <= radius + entity.radius;
        });
    }
}

// Global instance for the current level
// Cast to any to allow usage with specific entity types (Enemy, etc)
export const levelSpatialHash = new SpatialHashGrid<any>(100);
