/**
 * WEAPON IMPLEMENTATIONS - Re-export from modular files
 * 
 * This file maintains backward compatibility.
 * New code should import from './implementations' directly.
 * 
 * BEFORE: 1022 lines (37KB)
 * AFTER:  Re-exports only (~15 lines)
 */

// Re-export all weapons for backward compatibility
export * from './implementations/index';
