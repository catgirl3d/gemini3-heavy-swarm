import { type AgentRole } from '@/types';

/**
 * Runtime guard to assert that a role has a valid ID.
 * Throws an error if the role is missing an ID.
 * 
 * This is a safety measure for ensuring data integrity,
 * especially after migrations or when loading legacy data.
 * 
 * Note: Uses `function` keyword (not arrow function) because TypeScript
 * requires it for assertion functions with `asserts` keyword.
 * See: coding_standards.md section 2.1
 * 
 * @param role - The role to check
 * @param context - Optional context for better error messages
 * @throws Error if role.id is missing or empty
 */
export function assertRoleHasId(role: Partial<AgentRole>, context?: string): asserts role is AgentRole & { id: string } {
  if (!hasValidId(role)) {
    const contextStr = context ? ` (${context})` : '';
    throw new Error(
      `Role is missing required ID${contextStr}. ` +
      `Role name: "${role.name ?? 'unknown'}". ` +
      `This indicates a data integrity issue. Please contact support.`
    );
  }
}

/**
 * Checks if an object has a valid, non-empty string ID.
 * Generic helper for roles, instructions, and other entities.
 * 
 * @param entity - The object to check
 * @returns true if id is present and not whitespace
 */
export const hasValidId = (entity: { id?: string }): entity is { id: string } => {
  return !!entity.id && entity.id.trim() !== '';
};

/**
 * Safe version that returns a boolean instead of throwing.
 * Useful for validation checks without try-catch blocks.
 *
 * @param role - The role to check
 * @returns true if role has a valid ID, false otherwise
 */
export const hasValidRoleId = (role: Partial<AgentRole>): role is AgentRole & { id: string } => {
  return hasValidId(role);
};
