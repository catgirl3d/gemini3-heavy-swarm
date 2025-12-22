import React from 'react';
import { AppSettings, RoleProfile } from '../../../types';

export function useRoleManagement(
    localSettings: AppSettings,
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
    activeRoleProfile: RoleProfile,
    activeRoleType: 'drafter' | 'critic'
) {
    const handleRoleChange = (index: number, field: 'name' | 'instruction', value: string) => {
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    const newRoles = [...currentRoles];
                    if (newRoles[index]) {
                        newRoles[index] = { ...newRoles[index], [field]: value };
                    }
                    return { ...p, [roleKey]: newRoles };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
        });
    };

    const handleApplyRole = (index: number, role: { name: string, instruction: string }) => {
        setLocalSettings(prev => {
            const targetId = activeRoleProfile.id;
            const newProfiles = (prev.roleProfiles || []).map(p => {
                if (p.id === targetId) {
                    const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                    const currentRoles = p[roleKey] || [];
                    const newRoles = [...currentRoles];
                    if (newRoles[index]) {
                        newRoles[index] = { ...newRoles[index], name: role.name, instruction: role.instruction };
                    }
                    return { ...p, [roleKey]: newRoles };
                }
                return p;
            });
            return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
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

    return {
        handleRoleChange,
        handleApplyRole,
        handleAddRole,
        handleDeleteRole,
        handleMoveRole
    };
}
