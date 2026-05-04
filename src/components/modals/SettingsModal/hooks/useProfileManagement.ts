import type React from 'react';
import { type AppSettings, type PromptProfile, type RoleProfile } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_PROFILES, DEFAULT_ROLE_PROFILES } from '@/constants';
import { generateUUID } from '@/utils/common/uuid';
import { cleanupProfileModels, cloneProfileModels } from '@/utils/settings/providerPersistence';
import { Logger } from '@shared/utils/logger';
import { createErrorHandler } from '@shared/utils/errorHandler';

const logger = new Logger('ProfileManagement');

export const useProfileManagement = (
    localSettings: AppSettings,
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
    activeProfile: PromptProfile,
    activeRoleProfile: RoleProfile,
    setIsEditingProfileName: (val: boolean) => void,
    setIsEditingRoleName: (val: boolean) => void,
    onShowError?: (message: string) => void
) => {
    const showError = createErrorHandler(onShowError);

    const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLocalSettings(prev => ({
            ...prev,
            activeProfileId: e.target.value
        }));
    };

    const handleRoleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLocalSettings(prev => ({
            ...prev,
            activeRoleProfileId: e.target.value
        }));
    };

    const handleCreateProfile = (clone: boolean = true) => {
        try {
            const baseProfile = clone ? activeProfile : DEFAULT_PROFILES[0];
            const newProfile: PromptProfile = {
                id: `custom-${Date.now()}`,
                name: clone ? `${baseProfile.name} (Copy)` : 'New Custom Profile',
                initialInstruction: baseProfile.initialInstruction,
                refinementInstruction: baseProfile.refinementInstruction,
                synthesizerInstruction: baseProfile.synthesizerInstruction
            };
            setLocalSettings(prev => ({
                ...prev,
                profiles: [...(prev.profiles || []), newProfile],
                activeProfileId: newProfile.id
            }));
            logger.info(`Created ${clone ? 'cloned' : 'new'} prompt profile`, { profileId: newProfile.id });
        } catch (error) {
            const message = 'Failed to create prompt profile. Please try again.';
            logger.error('Error in handleCreateProfile', { error, clone });
            showError(message);
        }
    };

    /**
     * Creates a new role profile either by cloning the current one or from defaults.
     * 
     * IMPORTANT DISTINCTION:
     * - When CLONING (clone=true): Copies all role models and providerModels settings
     *   → User wants to duplicate the entire profile with all configurations
     * - When creating NEW (clone=false): Starts with clean slate, no models copied
     *   → User wants fresh profile based on default roles only
     * 
     * This is DIFFERENT from handleRestoreDefaultRoles which:
     * - Resets an EXISTING profile to defaults
     * - MUST clear old models to prevent orphaned data
     */
    const handleCreateRoleProfile = (clone: boolean = true) => {
        try {
            const baseProfile = clone ? activeRoleProfile : DEFAULT_ROLE_PROFILES[0];
            const roleIdMap: Record<string, string> = {};

            const newRoleProfile: RoleProfile = {
                id: `custom-roles-${Date.now()}`,
                name: clone ? `${baseProfile.name} (Copy)` : 'New Role Set',
                // Clone roles with new IDs to prevent ID collisions between profiles
                roles: baseProfile.roles.map(role => {
                    const newId = generateUUID();
                    if (clone) roleIdMap[role.id] = newId; // Track ID mapping for providerModels cloning
                    return {
                        ...role,
                        id: newId,
                        // INTENTIONAL: Copy model when cloning, undefined when creating new
                        model: clone ? role.model : undefined
                    };
                }),
                criticRoles: baseProfile.criticRoles
                    ? baseProfile.criticRoles.map(role => {
                        const newId = generateUUID();
                        if (clone) roleIdMap[role.id] = newId; // Track ID mapping for providerModels cloning
                        return {
                            ...role,
                            id: newId,
                            // INTENTIONAL: Copy model when cloning, undefined when creating new
                            model: clone ? role.model : undefined
                        };
                      })
                    : []
            };

            setLocalSettings(prev => {
                let updated = {
                    ...prev,
                    roleProfiles: [...(prev.roleProfiles || []), newRoleProfile],
                    activeRoleProfileId: newRoleProfile.id
                };

                // CRITICAL: When cloning, also copy model configurations from providerModels
                // This ensures all provider-specific models are preserved in the new profile
                if (clone) {
                    updated = cloneProfileModels(updated, baseProfile.id, newRoleProfile.id, roleIdMap);
                }

                return updated;
            });
            logger.info(`Created ${clone ? 'cloned' : 'new'} role profile`, { profileId: newRoleProfile.id, rolesCount: newRoleProfile.roles.length });
        } catch (error) {
            const message = 'Failed to create role profile due to an internal error. Please try again.';
            logger.error('Error in handleCreateRoleProfile', { error, clone });
            showError(message);
        }
    };

    const handleDeleteProfile = () => {
        try {
            const profiles = localSettings.profiles || [];
            if (profiles.length <= 1) {
                showError('Cannot delete the last remaining prompt profile.');
                return;
            }
            const profileIdToDelete = localSettings.activeProfileId;
            setLocalSettings(prev => {
                const currentProfiles = prev.profiles || [];
                const newProfiles = currentProfiles.filter(p => p.id !== prev.activeProfileId);
                return {
                    ...prev,
                    profiles: newProfiles,
                    activeProfileId: newProfiles[0]?.id || ''
                };
            });
            logger.info('Deleted prompt profile', { profileId: profileIdToDelete });
        } catch (error) {
            const message = 'Failed to delete prompt profile. Please try again.';
            logger.error('Error in handleDeleteProfile', { error });
            showError(message);
        }
    };

    const handleDeleteRoleProfile = () => {
        try {
            const profileIdToDelete = localSettings.activeRoleProfileId;
            if ((localSettings.roleProfiles || []).length <= 1) {
                showError('Cannot delete the last remaining role profile.');
                return;
            }
            
            setLocalSettings(prev => {
                const newProfiles = (prev.roleProfiles || []).filter(p => p.id !== profileIdToDelete);
                const updated = {
                    ...prev,
                    roleProfiles: newProfiles,
                    activeRoleProfileId: newProfiles[0].id
                };
                
                return cleanupProfileModels(updated, profileIdToDelete);
            });
            logger.info('Deleted role profile and cleaned up orphaned models', { profileId: profileIdToDelete });
        } catch (error) {
            const message = 'Failed to delete role profile. Please try again.';
            logger.error('Error in handleDeleteRoleProfile', { error });
            showError(message);
        }
    };

    const handleRenameProfile = (newName: string) => {
        try {
            if (!newName || !newName.trim()) {
                showError('Profile name cannot be empty.');
                return;
            }
            setLocalSettings(prev => {
                const profiles = prev.profiles || [];
                const newProfiles = profiles.map(p => {
                    if (p.id === prev.activeProfileId) {
                        return { ...p, name: newName.trim() };
                    }
                    return p;
                });
                return { ...prev, profiles: newProfiles };
            });
            logger.info('Renamed prompt profile', { profileId: localSettings.activeProfileId, newName });
        } catch (error) {
            const message = 'Failed to rename prompt profile. Please try again.';
            logger.error('Error in handleRenameProfile', { error, newName });
            showError(message);
        }
    };

    const handleRenameRoleProfile = (newName: string) => {
        try {
            if (!newName || !newName.trim()) {
                showError('Role profile name cannot be empty.');
                return;
            }
            setLocalSettings(prev => {
                const newProfiles = (prev.roleProfiles || []).map(p => {
                    if (p.id === prev.activeRoleProfileId) {
                        return { ...p, name: newName.trim() };
                    }
                    return p;
                });
                return { ...prev, roleProfiles: newProfiles };
            });
            logger.info('Renamed role profile', { profileId: localSettings.activeRoleProfileId, newName });
        } catch (error) {
            const message = 'Failed to rename role profile. Please try again.';
            logger.error('Error in handleRenameRoleProfile', { error, newName });
            showError(message);
        }
    };

    return {
        handleProfileChange,
        handleRoleProfileChange,
        handleCreateProfile,
        handleCreateRoleProfile,
        handleDeleteProfile,
        handleDeleteRoleProfile,
        handleRenameProfile,
        handleRenameRoleProfile
    };
}
