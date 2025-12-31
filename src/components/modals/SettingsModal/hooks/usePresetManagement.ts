import React from 'react';
import { AppSettings, PromptProfile, RoleProfile, PROMPT_TYPES } from '@/types';
import { DEFAULT_SETTINGS } from '@/constants';
import { InstructionType } from '@/components/modals/SettingsModal/types';
import { INSTRUCTION_METADATA } from '@/components/modals/SettingsModal/constants';

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
            model: r.model,
            isCustom: true,
            id: r.id
        }));

        const noRolePreset = {
            name: "No Role",
            instruction: "",
            model: "",
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
            instruction: type === PROMPT_TYPES.INITIAL ? p.initialInstruction : type === PROMPT_TYPES.REFINEMENT ? p.refinementInstruction : p.synthesizerInstruction,
            model: (localSettings[INSTRUCTION_METADATA[type].modelKey] as string) || '', // Pass current model for profile-based presets
            isCustom: false
        }));

        const savedPresets = (localSettings.savedInstructions || []).filter(i => i.type === type).map(i => ({
            id: i.id,
            name: i.name,
            instruction: i.content,
            model: i.model,
            isCustom: true
        }));

        return [...savedPresets, ...profilePresets];
    };

    const handleSaveInstructionPreset = (editingInstruction: InstructionType | null, newPresetName: string) => {
        if (!editingInstruction || !newPresetName.trim()) return;

        const currentInstruction = editingInstruction === PROMPT_TYPES.INITIAL
            ? activeProfile.initialInstruction
            : editingInstruction === PROMPT_TYPES.REFINEMENT
                ? activeProfile.refinementInstruction
                : activeProfile.synthesizerInstruction;
        
        // Need to get current model too
        const currentModel = (localSettings[INSTRUCTION_METADATA[editingInstruction].modelKey] as string) || '';

        setLocalSettings(prev => ({
            ...prev,
            savedInstructions: [
                ...(prev.savedInstructions || []),
                {
                    id: `saved-${Date.now()}`,
                    name: newPresetName.trim(),
                    type: editingInstruction,
                    content: currentInstruction,
                    model: currentModel
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

    const handleSaveRolePreset = (editingRoleIndex: number | null, activeRoleType: 'drafter' | 'critic', activeRoleProfile: RoleProfile, newPresetName: string) => {
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
                    instruction: currentRole.instruction,
                    model: currentRole.model
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

    const handleApplyInstructionPreset = (type: InstructionType, instruction: string, model?: string) => {
        setLocalSettings(prev => {
            const newProfiles = prev.profiles.map(p => {
                if (p.id === prev.activeProfileId) {
                    return {
                        ...p,
                        [type === PROMPT_TYPES.INITIAL ? 'initialInstruction' : type === PROMPT_TYPES.REFINEMENT ? 'refinementInstruction' : 'synthesizerInstruction']: instruction
                    };
                }
                return p;
            });
            
            const updatedSettings = { ...prev, profiles: newProfiles };
            
            // Also apply model if provided
            if (model !== undefined) {
                (updatedSettings as any)[INSTRUCTION_METADATA[type].modelKey] = model || undefined;
            }
            
            return updatedSettings;
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
