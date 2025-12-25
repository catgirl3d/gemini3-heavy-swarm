import React from 'react';
import { AppSettings, PromptProfile } from '../../../types';
import { DEFAULT_SETTINGS } from '../../../constants';
import { InstructionType } from '../types';

export function usePresetManagement(
    localSettings: AppSettings,
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
    activeProfile: PromptProfile
) {
    const getRolePresets = (profileId: string, type: 'drafter' | 'critic') => {
        const defaultProfile = DEFAULT_SETTINGS.roleProfiles.find(p => p.id === profileId);
        const defaultRoles = defaultProfile ? (type === 'drafter' ? defaultProfile.roles : (defaultProfile.criticRoles || [])) : [];

        const profilePresets = defaultRoles.map(r => ({
            ...r,
            isCustom: false,
            id: `default-${r.name}`
        }));

        const savedPresets = (localSettings.savedRoles || []).map(r => ({
            name: r.name,
            instruction: r.instruction,
            isCustom: true,
            id: r.id
        }));

        const noRolePreset = {
            name: "No Role",
            instruction: "",
            isCustom: false,
            id: "default-no-role"
        };

        const hasNoRole = [...savedPresets, ...profilePresets].some(p => p.name === "No Role");

        if (!hasNoRole) {
            return [noRolePreset, ...savedPresets, ...profilePresets];
        }

        return [...savedPresets, ...profilePresets];
    };

    const getInstructionPresets = (type: InstructionType) => {
        const profilePresets = (localSettings.profiles || []).filter(p => p.id !== localSettings.activeProfileId).map(p => ({
            id: p.id,
            name: p.name,
            instruction: type === 'initial_prompt' ? p.initialInstruction : type === 'refinement_prompt' ? p.refinementInstruction : p.synthesizerInstruction,
            isCustom: false
        }));

        const savedPresets = (localSettings.savedInstructions || []).filter(i => i.type === type).map(i => ({
            id: i.id,
            name: i.name,
            instruction: i.content,
            isCustom: true
        }));

        return [...savedPresets, ...profilePresets];
    };

    const handleSaveInstructionPreset = (editingInstruction: InstructionType | null, newPresetName: string) => {
        if (!editingInstruction || !newPresetName.trim()) return;

        const currentInstruction = editingInstruction === 'initial_prompt'
            ? activeProfile.initialInstruction
            : editingInstruction === 'refinement_prompt'
                ? activeProfile.refinementInstruction
                : activeProfile.synthesizerInstruction;

        setLocalSettings(prev => ({
            ...prev,
            savedInstructions: [
                ...(prev.savedInstructions || []),
                {
                    id: `saved-${Date.now()}`,
                    name: newPresetName.trim(),
                    type: editingInstruction,
                    content: currentInstruction
                }
            ]
        }));
    };

    const handleDeleteInstructionPreset = (id: string) => {
        setLocalSettings(prev => ({
            ...prev,
            savedInstructions: (prev.savedInstructions || []).filter(i => i.id !== id)
        }));
    };

    const handleSaveRolePreset = (editingRoleIndex: number | null, activeRoleType: 'drafter' | 'critic', activeRoleProfile: any, newPresetName: string) => {
        if (editingRoleIndex === null || !newPresetName.trim()) return;

        const roleList = activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles;
        const currentRole = (roleList || [])[editingRoleIndex];

        if (!currentRole) return;

        setLocalSettings(prev => ({
            ...prev,
            savedRoles: [
                ...(prev.savedRoles || []),
                {
                    id: `saved-role-${Date.now()}`,
                    name: newPresetName.trim(),
                    instruction: currentRole.instruction
                }
            ]
        }));
    };

    const handleDeleteRolePreset = (id: string) => {
        setLocalSettings(prev => ({
            ...prev,
            savedRoles: (prev.savedRoles || []).filter(r => r.id !== id)
        }));
    };

    const handleApplyInstructionPreset = (type: InstructionType, instruction: string) => {
        setLocalSettings(prev => {
            const newProfiles = prev.profiles.map(p => {
                if (p.id === prev.activeProfileId) {
                    return {
                        ...p,
                        [type === 'initial_prompt' ? 'initialInstruction' : type === 'refinement_prompt' ? 'refinementInstruction' : 'synthesizerInstruction']: instruction
                    };
                }
                return p;
            });
            return { ...prev, profiles: newProfiles };
        });
    };

    return {
        getRolePresets,
        getInstructionPresets,
        handleSaveInstructionPreset,
        handleDeleteInstructionPreset,
        handleSaveRolePreset,
        handleDeleteRolePreset,
        handleApplyInstructionPreset
    };
}
