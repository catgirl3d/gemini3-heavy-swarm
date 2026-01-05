import { AppSettings, ProviderType } from '@/types';

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
 * @param prev The current application settings
 * @param newProvider The provider being switched to
 * @returns Updated settings with the new provider and its relevant models
 */
export function persistProviderModels(prev: AppSettings, newProvider: ProviderType): AppSettings {
    const oldProvider = prev.provider;
    
    // Don't process if not actually changing
    if (oldProvider === newProvider) return prev;
    
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
        if (!roleModels[profile.id]) {
            roleModels[profile.id] = {};
        }
        
        const roleData: Record<number, string> = {};
        const criticData: Record<number, string> = {};
        
        // Save drafter role models
        profile.roles?.forEach((role, index) => {
            if (role.model) {
                roleData[index] = role.model;
            }
        });
        
        // Save critic role models
        profile.criticRoles?.forEach((role, index) => {
            if (role.model) {
                criticData[index] = role.model;
            }
        });
        
        roleModels[profile.id][oldProvider] = {
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
            roles: profile.roles?.map((role, index) => ({
                ...role,
                // Restore saved model for new provider, or undefined if never set
                model: savedRoleModels?.roles?.[index] || undefined
            })),
            criticRoles: profile.criticRoles?.map((role, index) => ({
                ...role,
                // Restore saved model for new provider, or undefined if never set
                model: savedRoleModels?.criticRoles?.[index] || undefined
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
 * Ensures settings loaded from storage don't have incompatible models.
 * This handles edge cases where settings were manually edited or corrupted.
 * 
 * @param settings Settings to sanitize
 * @returns Sanitized settings
 */
export function sanitizeLoadedSettings(settings: AppSettings): AppSettings {
    // If providerModels exists, we trust the switching logic handled everything
    if (settings.providerModels) {
        return settings;
    }
    
    // Legacy settings without providerModels - just clear all custom models
    // This ensures a clean state for first-time use of the new system
    return {
        ...settings,
        initialModel: undefined,
        refinementModel: undefined,
        synthesisModel: undefined,
        roleProfiles: settings.roleProfiles?.map(profile => ({
            ...profile,
            roles: profile.roles?.map(role => ({ ...role, model: undefined })),
            criticRoles: profile.criticRoles?.map(role => ({ ...role, model: undefined }))
        })),
        providerModels: { stepModels: {}, roleModels: {} }
    };
}

/**
 * Updates a step model and syncs it with providerModels.
 * This is the centralized function for all step model changes.
 * 
 * @param settings Current settings
 * @param stepKey Which step model to update ('initialModel', 'refinementModel', 'synthesisModel')
 * @param model New model value (or undefined to clear)
 * @returns Updated settings
 */
export function updateStepModel(
    settings: AppSettings,
    stepKey: 'initialModel' | 'refinementModel' | 'synthesisModel',
    model: string | undefined
): AppSettings {
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
    
    return {
        ...settings,
        [stepKey]: model || undefined,
        providerModels: {
            ...providerModels,
            stepModels
        }
    };
}

/**
 * Updates a role model and syncs it with providerModels.
 * This is the centralized function for all role model changes.
 * 
 * @param settings Current settings
 * @param profileId Role profile ID
 * @param roleType 'drafter' or 'critic'
 * @param roleIndex Index of the role in the array
 * @param model New model value (or undefined to clear)
 * @returns Updated settings
 */
export function updateRoleModel(
    settings: AppSettings,
    profileId: string,
    roleType: 'drafter' | 'critic',
    roleIndex: number,
    model: string | undefined
): AppSettings {
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
    
    // Update or remove the model
    if (model) {
        currentProviderRoleModels[roleIndex] = model;
    } else {
        delete currentProviderRoleModels[roleIndex];
    }
    
    roleModels[profileId][provider] = {
        ...roleModels[profileId][provider],
        [roleTypeKey]: Object.keys(currentProviderRoleModels).length > 0 ? currentProviderRoleModels : undefined
    };
    
    // Update the actual role profile
    const updatedRoleProfiles = settings.roleProfiles?.map(profile => {
        if (profile.id !== profileId) return profile;
        
        const roleKey = roleTypeKey;
        const roles = profile[roleKey] || [];
        const updatedRoles = [...roles];
        
        if (updatedRoles[roleIndex]) {
            updatedRoles[roleIndex] = {
                ...updatedRoles[roleIndex],
                model: model || undefined
            };
        }
        
        return {
            ...profile,
            [roleKey]: updatedRoles
        };
    });
    
    return {
        ...settings,
        roleProfiles: updatedRoleProfiles,
        providerModels: {
            ...providerModels,
            roleModels
        }
    };
}

