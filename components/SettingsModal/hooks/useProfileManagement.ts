import React from 'react';
import { AppSettings, PromptProfile, RoleProfile } from '@/types';
import { DEFAULT_SETTINGS } from '@/constants';

export function useProfileManagement(
    localSettings: AppSettings,
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
    activeProfile: PromptProfile,
    activeRoleProfile: RoleProfile,
    setIsEditingProfileName: (val: boolean) => void,
    setIsEditingRoleName: (val: boolean) => void
) {
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

    const handleCreateProfile = () => {
        const newProfile: PromptProfile = {
            id: `custom-${Date.now()}`,
            name: 'New Custom Profile',
            initialInstruction: activeProfile.initialInstruction,
            refinementInstruction: activeProfile.refinementInstruction,
            synthesizerInstruction: activeProfile.synthesizerInstruction
        };
        setLocalSettings(prev => ({
            ...prev,
            profiles: [...(prev.profiles || []), newProfile],
            activeProfileId: newProfile.id
        }));
    };

    const handleCreateRoleProfile = () => {
        const newRoleProfile: RoleProfile = {
            id: `custom-roles-${Date.now()}`,
            name: 'New Role Set',
            roles: [...activeRoleProfile.roles],
            criticRoles: activeRoleProfile.criticRoles ? [...activeRoleProfile.criticRoles] : []
        };
        setLocalSettings(prev => ({
            ...prev,
            roleProfiles: [...(prev.roleProfiles || []), newRoleProfile],
            activeRoleProfileId: newRoleProfile.id
        }));
    };

    const handleDeleteProfile = () => {
        const profiles = localSettings.profiles || [];
        if (profiles.length <= 1) return;
        setLocalSettings(prev => {
            const currentProfiles = prev.profiles || [];
            const newProfiles = currentProfiles.filter(p => p.id !== prev.activeProfileId);
            return {
                ...prev,
                profiles: newProfiles,
                activeProfileId: newProfiles[0]?.id || ''
            };
        });
    };

    const handleDeleteRoleProfile = () => {
        if ((localSettings.roleProfiles || []).length <= 1) return;
        setLocalSettings(prev => {
            const newProfiles = (prev.roleProfiles || []).filter(p => p.id !== prev.activeRoleProfileId);
            return {
                ...prev,
                roleProfiles: newProfiles,
                activeRoleProfileId: newProfiles[0].id
            };
        });
    };

    const handleRenameProfile = (newName: string) => {
        setLocalSettings(prev => {
            const profiles = prev.profiles || [];
            const newProfiles = profiles.map(p => {
                if (p.id === prev.activeProfileId) {
                    return { ...p, name: newName };
                }
                return p;
            });
            return { ...prev, profiles: newProfiles };
        });
    };

    const handleRenameRoleProfile = (newName: string) => {
        setLocalSettings(prev => {
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === prev.activeRoleProfileId) {
                    return { ...p, name: newName };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles };
        });
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
