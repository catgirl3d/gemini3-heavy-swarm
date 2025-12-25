import { AppSettings, AgentRole } from '../../../types';

type RoleType = 'roles' | 'criticRoles';

/**
 * Gets the agent role by index from the active RoleProfile.
 * @param index - Agent index
 * @param settings - Application settings
 * @param roleType - 'roles' for InitialStep/SynthesisStep or 'criticRoles' for RefinementStep
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
  
  if (perspectives.length === 0) {
    return { name: fallbackName, instruction: '' };
  }
  
  return perspectives[index % perspectives.length];
};
