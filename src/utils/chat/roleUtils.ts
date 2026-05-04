import { AppSettings, AgentRole, RoleType } from '@/types';
import { hasValidRoleId } from '@/utils/validation/roleGuards';
import { generateUUID } from '@/utils/common/uuid';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('RoleUtils');

/**
 * Gets the agent role by index from the active RoleProfile.
 * Cycles through configured roles when there are more agents than roles.
 * Returns a fallback role only when no configured role exists or the selected role is invalid.
 * 
 * @param index - Agent index
 * @param settings - Application settings
 * @param roleType - 'roles' for InitialStep/SynthesisStep or 'criticRoles' for RefinementStep
 * @returns A valid AgentRole with guaranteed id, name, and instruction fields
 */
export const getAgentRole = (
  index: number, 
  settings: AppSettings, 
  roleType: RoleType = 'roles'
): AgentRole => {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) 
    || settings.roleProfiles?.[0];
  
  const perspectives = roleType === 'criticRoles' 
    ? (activeRoleProfile?.criticRoles || [])
    : (activeRoleProfile?.roles || []);
    
  const fallbackName = roleType === 'criticRoles' ? `Critic ${index + 1}` : `Agent ${index + 1}`;
  
  const normalizedIndex = perspectives.length > 0 ? index % perspectives.length : index;

  // Return the selected role if it exists AND has valid structure.
  const roleAtIndex = perspectives[normalizedIndex];
  if (roleAtIndex && hasValidRoleId(roleAtIndex) && roleAtIndex.name && roleAtIndex.instruction !== undefined) {
    return roleAtIndex;
  }

  // WARNING: Role exists but failed validation
  if (roleAtIndex) {
    logger.warn(
      `Role at index ${index} (type: ${roleType}) exists but failed validation. ` +
      `hasValidId: ${hasValidRoleId(roleAtIndex)}, ` +
      `hasName: ${!!roleAtIndex.name}, ` +
      `hasInstruction: ${roleAtIndex.instruction !== undefined}`,
      roleAtIndex
    );
  }

  // Otherwise return a fallback/empty role with deterministic ID
  return {
    id: `fallback-${roleType}-${index}`,
    name: fallbackName,
    instruction: '' 
  };
};

/**
 * Clones an array of roles with new unique IDs.
 * Used when duplicating profiles or restoring defaults to prevent ID collisions.
 * 
 * @param roles - Array of roles to clone
 * @param preserveModels - Whether to preserve model assignments (true for duplication, false for reset)
 * @returns Array of cloned roles with new UUIDs
 * 
 * @example
 * // When duplicating a profile (preserve models)
 * const clonedRoles = cloneRolesWithNewIds(originalRoles, true);
 * 
 * // When restoring defaults (clear models)
 * const resetRoles = cloneRolesWithNewIds(defaultRoles, false);
 */
export const cloneRolesWithNewIds = (
  roles: AgentRole[],
  preserveModels: boolean = false
): AgentRole[] => {
  return roles.map(role => ({
    ...role,
    id: generateUUID(),
    model: preserveModels ? role.model : undefined
  }));
};
