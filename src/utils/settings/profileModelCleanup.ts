import { type AppSettings, type ProviderType, type ProviderModels } from '@/types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('ProfileModelCleanup');

/**
 * Removes all saved model configurations for a specific role ID across all providers
 * within a given profile. This prevents "orphaned" data from accumulating in
 * providerModels when roles are deleted.
 *
 * @param settings Current settings
 * @param profileId The ID of the profile containing the role
 * @param roleId The unique ID of the role being deleted
 * @returns Updated settings with the role's model data removed from all providers
 */
export function cleanupRoleModels(
    settings: AppSettings,
    profileId: string,
    roleId: string
): AppSettings {
    if (!settings.providerModels?.roleModels?.[profileId]) return settings;

    const roleModels = { ...settings.providerModels.roleModels };
    const profileRoleModels = { ...roleModels[profileId] };
    let modified = false;

    // Iterate through all providers saved for this profile
    Object.keys(profileRoleModels).forEach(providerKey => {
        const provider = providerKey as ProviderType;
        const providerData = { ...profileRoleModels[provider] };
        let providerModified = false;
        
        // Check and clean drafter roles
        if (providerData.roles && providerData.roles[roleId]) {
            const newRoles = { ...providerData.roles };
            delete newRoles[roleId];
            providerData.roles = Object.keys(newRoles).length > 0 ? newRoles : undefined;
            providerModified = true;
        }
        
        // Check and clean critic roles
        if (providerData.criticRoles && providerData.criticRoles[roleId]) {
            const newCriticRoles = { ...providerData.criticRoles };
            delete newCriticRoles[roleId];
            providerData.criticRoles = Object.keys(newCriticRoles).length > 0 ? newCriticRoles : undefined;
            providerModified = true;
        }

        if (providerModified) {
            profileRoleModels[provider] = providerData;
            modified = true;
        }
    });

    if (!modified) return settings;

    roleModels[profileId] = profileRoleModels;

    logger.info(`Cleaned up orphaned model data for role "${roleId}" in profile "${profileId}" across all providers`);

    return {
        ...settings,
        providerModels: {
            ...settings.providerModels,
            roleModels
        }
    };
}

/**
 * Removes all saved model configurations for a specific profile ID across all providers.
 * This prevents "orphaned" data from accumulating in providerModels when profiles are deleted.
 *
 * @param settings Current settings
 * @param profileId The ID of the profile being deleted
 * @returns Updated settings with the profile's model data removed
 */
export function cleanupProfileModels(
    settings: AppSettings,
    profileId: string
): AppSettings {
    if (!settings.providerModels?.roleModels?.[profileId]) return settings;

    const roleModels = { ...settings.providerModels.roleModels };
    delete roleModels[profileId];

    logger.info(`Cleaned up orphaned model data for profile "${profileId}" across all providers`);

    return {
        ...settings,
        providerModels: {
            ...settings.providerModels,
            roleModels
        }
    };
}

/**
 * Clears all role model assignments for a specific profile across all providers.
 * Used when restoring default roles to prevent orphaned model data.
 * 
 * IMPORTANT: This is NOT the same as cleanupProfileModels!
 * - clearAllRoleModelsInProfile: Clears models but KEEPS the profile entry
 *   → Used when resetting roles to defaults (profile still exists)
 * - cleanupProfileModels: Deletes the entire profile entry
 *   → Used when deleting a profile completely
 * 
 * USE CASE: handleRestoreDefaultRoles
 * - Old roles with IDs [abc, def, xyz] are replaced with new roles [new1, new2, new3]
 * - providerModels still has mappings for [abc, def, xyz] that are now useless
 * - This function clears those orphaned mappings to prevent localStorage bloat
 *
 * @param settings Current settings
 * @param profileId The ID of the profile to clear models from
 * @returns Updated settings with all role models cleared for the profile
 */
export function clearAllRoleModelsInProfile(
    settings: AppSettings,
    profileId: string
): AppSettings {
    if (!settings.providerModels?.roleModels?.[profileId]) return settings;

    const roleModels = { ...settings.providerModels.roleModels };
    
    // Clear all provider data for this profile (sets to empty object, not undefined)
    // This keeps the profile entry but removes all role model mappings
    roleModels[profileId] = {};

    logger.info(`Cleared all role model assignments for profile "${profileId}" across all providers`);

    return {
        ...settings,
        providerModels: {
            ...settings.providerModels,
            roleModels
        }
    };
}

/**
 * Clones model configurations from one profile to another, mapping old role IDs to new ones.
 * This ensures that a cloned profile retains all model settings across all providers.
 * 
 * USE CASE: handleCreateRoleProfile with clone=true (Profile Duplication)
 * - User clicks "Duplicate" to create a copy of their configured profile
 * - New roles get new UUIDs to prevent ID collisions
 * - This function ensures model assignments are preserved in the new profile
 * - Maps old role IDs to new ones so models follow the cloned roles
 * 
 * @param settings Current settings
 * @param sourceProfileId ID of the profile to clone from
 * @param targetProfileId ID of the new profile
 * @param roleIdMap Map of old role IDs to new role IDs (e.g., {old-abc: new-xyz})
 * @returns Updated settings with cloned model configurations
 */
export function cloneProfileModels(
    settings: AppSettings,
    sourceProfileId: string,
    targetProfileId: string,
    roleIdMap: Record<string, string>
): AppSettings {
    if (!settings.providerModels?.roleModels?.[sourceProfileId]) return settings;

    const roleModels = { ...settings.providerModels.roleModels };
    const sourceData = roleModels[sourceProfileId];
    const targetData: NonNullable<ProviderModels['roleModels']>[string] = {};

    // Iterate through all providers in the source profile
    Object.entries(sourceData).forEach(([provider, providerData]) => {
        targetData[provider] = {};
        
        if (providerData.roles) {
            targetData[provider].roles = {};
            Object.entries(providerData.roles).forEach(([oldId, model]) => {
                const newId = roleIdMap[oldId];
                if (newId) {
                    targetData[provider].roles[newId] = model;
                }
            });
        }
        
        if (providerData.criticRoles) {
            targetData[provider].criticRoles = {};
            Object.entries(providerData.criticRoles).forEach(([oldId, model]) => {
                const newId = roleIdMap[oldId];
                if (newId) {
                    targetData[provider].criticRoles[newId] = model;
                }
            });
        }
    });

    roleModels[targetProfileId] = targetData;

    logger.info(`Cloned model configurations from profile "${sourceProfileId}" to "${targetProfileId}"`);

    return {
        ...settings,
        providerModels: {
            ...settings.providerModels,
            roleModels
        }
    };
}
