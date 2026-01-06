import React from 'react';
import { AppSettings, RoleProfile, AgentRole, RoleType } from '@/types';
import { DEFAULT_ROLE_PROFILES } from '@/constants/roles';
import { updateRoleModel, cleanupRoleModels, clearAllRoleModelsInProfile } from '@/utils/settings/providerPersistence';
import { generateUUID } from '@/utils/common/uuid';
import { assertRoleHasId } from '@/utils/validation/roleGuards';
import { cloneRolesWithNewIds } from '@/utils/chat/roleUtils';
import { Logger } from '@shared/utils/logger';
import { createErrorHandler } from '@shared/utils/errorHandler';

const logger = new Logger('RoleManagement');

export const useRoleManagement = (
    localSettings: AppSettings,
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
    activeRoleProfile: RoleProfile,
    activeRoleType: 'drafter' | 'critic',
    onShowError?: (message: string) => void
) => {
    const targetId = activeRoleProfile.id;
    const roleKey: RoleType = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
    
    const showError = createErrorHandler(onShowError);

    /**
     * Helper to update roles within the active profile in a type-safe way.
     */
    const updateActiveProfileRoles = (prev: AppSettings, updater: (roles: AgentRole[]) => AgentRole[]) => {
        const newProfiles = (prev.roleProfiles || []).map(p => {
            if (p.id !== targetId) return p;
            return { ...p, [roleKey]: updater(p[roleKey] || []) };
        });
        return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
    };

    const handleRoleChange = (index: number, field: 'name' | 'instruction' | 'model', value: string) => {
        // Special handling for model field - use centralized function with role ID
        if (field === 'model') {
            setLocalSettings(prev => {
                const currentProfile = (prev.roleProfiles || []).find(p => p.id === targetId);
                if (!currentProfile) return prev;

                const roles = currentProfile[roleKey] || [];
                const role = roles[index];

                if (!role) {
                    const errorMsg = `Cannot update role in profile "${activeRoleProfile.name}": Invalid role data at index ${index}. Please try again or contact support.`;
                    logger.error('Cannot update model: role is missing', { index, field, profileName: activeRoleProfile.name });
                    setTimeout(() => showError(errorMsg), 0);
                    return prev;
                }
                
                // Runtime guard: ensure role has valid ID
                try {
                    assertRoleHasId(role, `roleType=${activeRoleType}, index=${index}`);
                } catch (error) {
                    const errorMsg = `Cannot update role "${role?.name || 'unknown'}" in profile "${activeRoleProfile.name}": Invalid role data. Please try again or contact support.`;
                    logger.error('Role ID validation failed', { error, index, field, roleName: role?.name, profileName: activeRoleProfile.name });
                    setTimeout(() => showError(errorMsg), 0);
                    return prev;
                }
                
                const result = updateRoleModel(prev, targetId, activeRoleType, role.id, value || undefined);
                
                if (result.success) {
                    return result.settings;
                } else {
                    const errorMsg = result.error || 'Failed to update role model. Please try again.';
                    logger.error('updateRoleModel failed', { error: result.error });
                    setTimeout(() => showError(errorMsg), 0);
                    return prev;
                }
            });
            return;
        }

        // Normal handling for other fields (name, instruction)
        setLocalSettings(prev => updateActiveProfileRoles(prev, (currentRoles) => {
            const newRoles = [...currentRoles];
            if (newRoles[index]) {
                newRoles[index] = { ...newRoles[index], [field]: value };
            }
            return newRoles;
        }));
    };

    const handleApplyRole = (index: number, rolePreset: { name: string, instruction: string, model?: string }) => {
        setLocalSettings(prev => {
            const currentProfile = (prev.roleProfiles || []).find(p => p.id === targetId);
            if (!currentProfile) return prev;

            const roles = currentProfile[roleKey] || [];
            const roleAtIndex = roles[index];
            
            if (!roleAtIndex) {
                const errorMsg = 'Cannot apply role preset: Invalid role data at index. Please try again or contact support.';
                logger.error('Cannot apply role: role not found at index', { index });
                setTimeout(() => showError(errorMsg), 0);
                return prev;
            }
            
            // Runtime guard: ensure role has valid ID
            try {
                assertRoleHasId(roleAtIndex, `roleType=${activeRoleType}, index=${index}`);
            } catch (error) {
                const errorMsg = 'Cannot apply role preset: Invalid role data. Please try again or contact support.';
                logger.error('Role ID validation failed', { error, index });
                setTimeout(() => showError(errorMsg), 0);
                return prev;
            }
            
            const roleId = roleAtIndex.id;
            
            // First apply name and instruction
            const updated = updateActiveProfileRoles(prev, (currentRoles) => {
                const newRoles = [...currentRoles];
                if (newRoles[index]) {
                    newRoles[index] = {
                        ...newRoles[index],
                        name: rolePreset.name,
                        instruction: rolePreset.instruction,
                        model: rolePreset.model
                    };
                }
                return newRoles;
            });
            
            // If model is being set, use centralized function to sync providerModels
            if (rolePreset.model !== undefined) {
                const result = updateRoleModel(updated, targetId, activeRoleType, roleId, rolePreset.model || undefined);
                
                if (result.success) {
                    return result.settings;
                } else {
                    const errorMsg = result.error || 'Failed to apply role preset model. Please try again.';
                    logger.error('updateRoleModel failed in handleApplyRole', { error: result.error });
                    setTimeout(() => showError(errorMsg), 0);
                    return updated; // Still return the version with updated name/instr
                }
            }
            
            return updated;
        });
    };

    const handleAddRole = () => {
        try {
            const newId = generateUUID();
            setLocalSettings(prev => updateActiveProfileRoles(prev, (currentRoles) => [
                ...currentRoles,
                { id: newId, name: 'New Role', instruction: '' }
            ]));
        } catch (error) {
            const message = 'Failed to generate unique ID for the new role. Please try again.';
            logger.error('UUID generation failed in handleAddRole', { error });
            showError(message);
        }
    };

    const handleDeleteRole = (index: number) => {
        setLocalSettings(prev => {
            const currentProfile = (prev.roleProfiles || []).find(p => p.id === targetId);
            if (!currentProfile) return prev;
            
            const roles = currentProfile[roleKey] || [];
            const roleToDelete = roles[index];
            
            let updatedSettings = updateActiveProfileRoles(prev, (currentRoles) => {
                const newRoles = [...currentRoles];
                newRoles.splice(index, 1);
                return newRoles;
            });

            if (roleToDelete?.id) {
                updatedSettings = cleanupRoleModels(updatedSettings, targetId, roleToDelete.id);
            }
            
            return updatedSettings;
        });
    };

    const handleMoveRole = (index: number, direction: 'up' | 'down') => {
        setLocalSettings(prev => updateActiveProfileRoles(prev, (currentRoles) => {
            const newRoles = [...currentRoles];
            if (direction === 'up' && index > 0) {
                [newRoles[index], newRoles[index - 1]] = [newRoles[index - 1], newRoles[index]];
            } else if (direction === 'down' && index < newRoles.length - 1) {
                [newRoles[index], newRoles[index + 1]] = [newRoles[index + 1], newRoles[index]];
            }
            return newRoles;
        }));
    };

    /**
     * Restores default roles for the current profile.
     * 
     * CRITICAL DISTINCTION from handleCreateRoleProfile:
     * - This resets an EXISTING profile (does not create a new one)
     * - Old roles are REPLACED with defaults (not copied)
     * - Old model assignments MUST be cleared to prevent orphaned data
     * 
     * WHY CLEAR MODELS?
     * - Old roles have different IDs than new default roles
     * - providerModels stores mappings by role.id
     * - Without clearing, old IDs persist in providerModels forever (memory leak)
     * - User expects a clean slate when clicking "Restore Defaults"
     * 
     * CONTRAST with handleCreateRoleProfile (CLONING):
     * - Creates NEW profile → intentionally COPIES models
     * - User wants to preserve settings in the clone
     * - No orphaned data because it's a separate profile
     */
    const handleRestoreDefaultRoles = () => {
        logger.info('Restoring default roles', { profileId: targetId, roleType: activeRoleType });
        
        try {
            // Find default profile based on the ID of the profile being restored
            const defaultProfile = DEFAULT_ROLE_PROFILES.find((p: RoleProfile) => p.id === targetId) || DEFAULT_ROLE_PROFILES[0];
            
            logger.debug('Found default profile', {
                defaultProfileId: defaultProfile.id,
                rolesCount: defaultProfile.roles.length,
                criticRolesCount: defaultProfile.criticRoles?.length || 0
            });

            // Generate new unique IDs for all roles to prevent conflicts
            // If we reuse DEFAULT_ROLE_PROFILES IDs, multiple profiles could have roles with same ID,
            // causing collisions in providerModels.roleModels mapping (profileId -> provider -> roleId)
            // preserveModels=false ensures models are cleared (fresh start)
            const newRoles = cloneRolesWithNewIds(defaultProfile.roles, false);
            const newCriticRoles = cloneRolesWithNewIds(defaultProfile.criticRoles || [], false);
            
            logger.info('Successfully restored default roles', {
                profileId: targetId,
                newDrafterRolesCount: newRoles.length,
                newCriticRolesCount: newCriticRoles.length
            });
            
            setLocalSettings(prev => {
                // CRITICAL FIX: Clear all old role models to prevent orphaned data
                // Old roles had different IDs, so their model mappings are now useless
                // Without this, localStorage accumulates dead mappings indefinitely
                let updated = clearAllRoleModelsInProfile(prev, targetId);
                
                // Update profiles with new default roles (fresh UUIDs, no models assigned)
                return {
                    ...updated,
                    roleProfiles: (updated.roleProfiles || []).map(p =>
                        p.id === targetId ? { ...p, roles: newRoles, criticRoles: newCriticRoles } : p
                    ),
                    activeRoleProfileId: targetId
                };
            });
        } catch (error) {
            const message = 'Failed to restore default roles due to an internal error. Please try again.';
            logger.error('Error in handleRestoreDefaultRoles', { error, profileId: targetId });
            showError(message);
        }
    };

    return {
        handleRoleChange,
        handleApplyRole,
        handleAddRole,
        handleDeleteRole,
        handleMoveRole,
        handleRestoreDefaultRoles
    };
}
