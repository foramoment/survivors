/**
 * WEAPON TYPES - Re-export from modular base files
 * 
 * This file maintains backward compatibility.
 * New code should import from './base' directly.
 * 
 * BEFORE: 1568 lines (56KB)
 * AFTER:  Re-exports only (~40 lines)
 */

// Re-export everything from base modules for backward compatibility
export * from './base';

// Re-export Entity and utilities that some files may expect from here
export { type Vector2, normalize, distance } from '../core/Utils';
