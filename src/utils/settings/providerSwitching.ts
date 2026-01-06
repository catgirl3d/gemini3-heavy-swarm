import { AppSettings, ProviderType } from '@/types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('ProviderSwitching');

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
