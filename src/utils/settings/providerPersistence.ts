import { AppSettings, ProviderType, ProviderModels } from '@/types';
import { UpdateResult } from '@/types/result-types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('SettingsPersistence');

/**
 * Mapping between AppSettings model keys and ProviderModels step names.
 */
const STEP_KEY_TO_NAME = {
    initialModel: 'initial',
    refinementModel: 'refinement',
    synthesisModel: 'synthesis'
} as const;


/**
 * Handles provider switching by saving the current provider's model configuration
 * and restoring the models for the new provider if they were previously saved.
 * 
 * This is the single source of truth for provider model persistence.
 * When switching providers:
 * 1. Current provider's models are saved in providerModels
 * 2. Active models are cleared (set to undefined)
 * 3. If models were previously saved for the new provider, they are restored
 *
 * INVARIANT: providerModels is the single source of truth for all provider-specific models.
 * The top-level initialModel/refinementModel/synthesisModel fields are just the active slice
 * for the current provider.
 *
 * @param prev The current application settings
 * @param newProvider The provider being switched to
 * @returns Updated settings with the new provider and its relevant models
 */
export function persistProviderModels(prev: AppSettings, newProvider: ProviderType): AppSettings {
    const oldProvider = prev.provider;
    
    // Don't process if not actually changing
    if (oldProvider === newProvider) return prev;
    
    logger.info(`Switching provider: ${oldProvider} -> ${newProvider}. Persisting models.`);

    // Initialize providerModels if it doesn't exist, and ensure sub-objects are initialized
    const providerModels = prev.providerModels || { stepModels: {}, roleModels: {} };
    const stepModels = { ...(providerModels.stepModels || {}) };
    const roleModels = { ...(providerModels.roleModels || {}) };
    
    // === STEP 1: SAVE current provider's step models ===
    stepModels[oldProvider] = {
        initial: prev.initialModel,
        refinement: prev.refinementModel,
        synthesis: prev.synthesisModel
    };
    
    // === STEP 2: SAVE current provider's role models ===
    prev.roleProfiles?.forEach(profile => {
        // Immutable update: clone the profile's role models map
        roleModels[profile.id] = { ...(roleModels[profile.id] || {}) };
        
        const roleData: Record<string, string> = {};
        const criticData: Record<string, string> = {};
        
        // Save drafter role models using role.id (not index!)
        profile.roles?.forEach((role) => {
            if (role.model && role.id) {
                roleData[role.id] = role.model;
            }
        });
        
        // Save critic role models using role.id (not index!)
        profile.criticRoles?.forEach((role) => {
            if (role.model && role.id) {
                criticData[role.id] = role.model;
            }
        });
        
        // Immutable update: clone the provider's entry before writing
        roleModels[profile.id][oldProvider] = {
            ...(roleModels[profile.id][oldProvider] || {}),
            roles: Object.keys(roleData).length > 0 ? roleData : undefined,
            criticRoles: Object.keys(criticData).length > 0 ? criticData : undefined
        };
    });
    
    // === STEP 3: RESTORE new provider's step models (or undefined if not saved) ===
    const newStepModels = stepModels[newProvider];
    const initialModel = newStepModels?.initial;
    const refinementModel = newStepModels?.refinement;
    const synthesisModel = newStepModels?.synthesis;
    
    // === STEP 4: RESTORE new provider's role models (or undefined if not saved) ===
    const updatedRoleProfiles = prev.roleProfiles?.map(profile => {
        const savedRoleModels = roleModels[profile.id]?.[newProvider];
        
        return {
            ...profile,
            roles: profile.roles?.map((role) => ({
                ...role,
                // Restore saved model for new provider using role.id, or undefined if never set
                model: (role.id && savedRoleModels?.roles?.[role.id]) || undefined
            })),
            criticRoles: profile.criticRoles?.map((role) => ({
                ...role,
                // Restore saved model for new provider using role.id, or undefined if never set
                model: (role.id && savedRoleModels?.criticRoles?.[role.id]) || undefined
            }))
        };
    });
    
    return {
        ...prev,
        provider: newProvider,
        initialModel,
        refinementModel,
        synthesisModel,
        roleProfiles: updatedRoleProfiles,
        providerModels: {
            stepModels,
            roleModels
        }
    };
}



/**
 * Updates a step model and syncs it with providerModels.
 * This is the centralized function for all step model changes.
 * 
 * @param settings Current settings
 * @param stepKey Which step model to update ('initialModel', 'refinementModel', 'synthesisModel')
 * @param model New model value (or undefined to clear)
 * @returns UpdateResult with updated settings and success status
 */
export function updateStepModel(
    settings: AppSettings,
    stepKey: 'initialModel' | 'refinementModel' | 'synthesisModel',
    model: string | undefined
): UpdateResult<AppSettings> {
    try {
        const provider = settings.provider;
        const providerModels = settings.providerModels || { stepModels: {}, roleModels: {} };
        const stepModels = { ...providerModels.stepModels };
        
        if (!stepModels[provider]) {
            stepModels[provider] = {};
        }
        
        // Map step key to step name using constant
        const stepName = STEP_KEY_TO_NAME[stepKey];
        
        stepModels[provider] = {
            ...stepModels[provider],
            [stepName]: model || undefined
        };
        
        if (!model) {
            logger.info(`Cleared model for step "${stepName}" (provider: ${provider})`);
        } else {
            logger.info(`Updated model for step "${stepName}" to "${model}" (provider: ${provider})`);
        }

        return {
            settings: {
                ...settings,
                [stepKey]: model || undefined,
                providerModels: {
                    ...providerModels,
                    stepModels
                }
            },
            success: true
        };
    } catch (error) {
        const errorMsg = `Failed to update step model "${stepKey}": ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg, error);
        return {
            settings,
            success: false,
            error: errorMsg
        };
    }
}

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
 * EXAMPLE:
 * Source profile has:
 *   - Role "Product Manager" (id: old-abc) → model: "gpt-4" for OpenRouter
 * After cloning:
 *   - New role "Product Manager" (id: new-xyz) → model: "gpt-4" for OpenRouter
 * 
 * CONTRAST with clearAllRoleModelsInProfile:
 * - cloneProfileModels: COPIES models to new profile (duplication)
 * - clearAllRoleModelsInProfile: DELETES models from existing profile (reset)
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

