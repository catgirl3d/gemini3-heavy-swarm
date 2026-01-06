import { AppSettings } from '@/types';
import { UpdateResult } from '@/types/result-types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('RoleModelUpdates');

/**
 * Updates a role model and syncs it with providerModels.
 * This is the centralized function for all role model changes.
 * 
 * @param settings Current settings
 * @param profileId Role profile ID
 * @param roleType 'drafter' or 'critic'
 * @param roleId The unique ID of the role to update
 * @param model New model value (or undefined to clear)
 * @returns UpdateResult with updated settings and success status
 */
export function updateRoleModel(
    settings: AppSettings,
    profileId: string,
    roleType: 'drafter' | 'critic',
    roleId: string,
    model: string | undefined
): UpdateResult<AppSettings> {
    try {
        const provider = settings.provider;
        const providerModels = settings.providerModels || { stepModels: {}, roleModels: {} };
        const roleModels = { ...providerModels.roleModels };
        
        // Initialize if needed
        if (!roleModels[profileId]) {
            roleModels[profileId] = {};
        }
        if (!roleModels[profileId][provider]) {
            roleModels[profileId][provider] = {};
        }
        
        const roleTypeKey = roleType === 'drafter' ? 'roles' : 'criticRoles';
        const currentProviderRoleModels = { ...(roleModels[profileId][provider][roleTypeKey] || {}) };
        
        // Update or remove the model using role ID
        if (model) {
            currentProviderRoleModels[roleId] = model;
            logger.info(`Updated role model for role "${roleId}" in profile "${profileId}" to "${model}" (provider: ${provider})`);
        } else {
            delete currentProviderRoleModels[roleId];
            logger.info(`Cleared role model for role "${roleId}" in profile "${profileId}" (provider: ${provider})`);
        }
        
        roleModels[profileId][provider] = {
            ...roleModels[profileId][provider],
            [roleTypeKey]: Object.keys(currentProviderRoleModels).length > 0 ? currentProviderRoleModels : undefined
        };
        
        // Update the actual role profile using role ID to find the role
        let roleFound = false;
        const updatedRoleProfiles = settings.roleProfiles?.map(profile => {
            if (profile.id !== profileId) return profile;
            
            const roleKey = roleTypeKey;
            const roles = profile[roleKey] || [];
            const updatedRoles = roles.map(role => {
                if (role.id === roleId) {
                    roleFound = true;
                    return {
                        ...role,
                        model: model || undefined
                    };
                }
                return role;
            });
            
            return {
                ...profile,
                [roleKey]: updatedRoles
            };
        });

        if (!roleFound) {
            const warnMsg = `Role "${roleId}" not found in profile "${profileId}" during model update`;
            logger.warn(warnMsg);
            return {
                settings,
                success: false,
                error: warnMsg
            };
        }
        
        return {
            settings: {
                ...settings,
                roleProfiles: updatedRoleProfiles,
                providerModels: {
                    ...providerModels,
                    roleModels
                }
            },
            success: true
        };
    } catch (error) {
        const errorMsg = `Failed to update role model for role "${roleId}": ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg, error);
        return {
            settings,
            success: false,
            error: errorMsg
        };
    }
}
