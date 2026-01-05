import React from 'react';
import { AppSettings, RoleProfile } from '@/types';
import { DEFAULT_ROLE_PROFILES } from '@/constants/roles';
import { updateRoleModel } from '@/utils/settings/providerPersistence';

export function useRoleManagement(
    localSettings: AppSettings,
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
    activeRoleProfile: RoleProfile,
    activeRoleType: 'drafter' | 'critic'
) {
    const handleRoleChange = (index: number, field: 'name' | 'instruction' | 'model', value: string) => {
        setLocalSettings(prev => {
            // Special handling for model field - use centralized function
            if (field === 'model') {
                return updateRoleModel(prev, activeRoleProfile.id, activeRoleType, index, value || undefined);
            }
            
            // For name and instruction, update directly
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    const newRoles = [...currentRoles];
                    if (newRoles[index]) {
                        newRoles[index] = { 
                            ...newRoles[index], 
                            [field]: value 
                        };
                    }
                    return { ...p, [roleKey]: newRoles };
                }
                return p;
            });
            
            return { 
                ...prev, 
                roleProfiles: newProfiles, 
                activeRoleProfileId: targetId
            };
        });
    };

    const handleApplyRole = (index: number, role: { name: string, instruction: string, model?: string }) => {
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            
            // Update name and instruction directly
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    const newRoles = [...currentRoles];
                    if (newRoles[index]) {
                        newRoles[index] = { 
                            ...newRoles[index], 
                            name: role.name, 
                            instruction: role.instruction,
                            model: role.model // Will be synced by updateRoleModel if needed
                        };
                    }
                    return { ...p, [roleKey]: newRoles };
                }
                return p;
            });
            
            const updated = {
                ...prev,
                roleProfiles: newProfiles,
                activeRoleProfileId: targetId
            };
            
            // If model is being set, use centralized function to sync providerModels
            if (role.model !== undefined) {
                return updateRoleModel(updated, targetId, activeRoleType, index, role.model || undefined);
            }
            
            return updated;
        });
    };

    const handleAddRole = () => {
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    return { ...p, [roleKey]: [...currentRoles, { name: 'New Role', instruction: '' }] };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
        });
    };

    const handleDeleteRole = (index: number) => {
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    const newRoles = [...currentRoles];
                    newRoles.splice(index, 1);
                    return { ...p, [roleKey]: newRoles };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
        });
    };

    const handleMoveRole = (index: number, direction: 'up' | 'down') => {
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    const newRoles = [...currentRoles];
                    if (direction === 'up' && index > 0) {
                        [newRoles[index], newRoles[index - 1]] = [newRoles[index - 1], newRoles[index]];
                    } else if (direction === 'down' && index < newRoles.length - 1) {
                        [newRoles[index], newRoles[index + 1]] = [newRoles[index + 1], newRoles[index]];
                    }
                    return { ...p, [roleKey]: newRoles };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
        });
    };

    const handleRestoreDefaultRoles = () => {
        const defaultProfile = DEFAULT_ROLE_PROFILES.find((p: RoleProfile) => p.id === activeRoleProfile.id) || DEFAULT_ROLE_PROFILES[0];
        
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    return { 
                        ...p, 
                        roles: [...defaultProfile.roles], 
                        criticRoles: [...(defaultProfile.criticRoles || [])] 
                    };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
        });
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
