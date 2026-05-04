import React, { type FC, type ChangeEvent } from 'react';
import { type AppSettings, type PromptProfile, PROMPT_TYPES } from '@/types';
import { ProfileHeader } from '@/components/modals/SettingsModal/components/ProfileHeader';
import { InstructionItem } from '@/components/modals/SettingsModal/components/InstructionItem';
import { INSTRUCTION_METADATA } from '@/components/modals/SettingsModal/constants';
import { type InstructionType } from '@/components/modals/SettingsModal/types';

interface PromptsTabProps {
    localSettings: AppSettings;
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    activeProfile: PromptProfile;
    isEditingProfileName: boolean;
    isModelUnlocked: boolean;
    setIsEditingProfileName: (val: boolean) => void;
    handleRenameProfile: (name: string) => void;
    handleProfileChange: (e: ChangeEvent<HTMLSelectElement>) => void;
    handleCreateProfile: () => void;
    handleDeleteProfile: () => void;
    setEditingInstruction: (type: InstructionType | null) => void;
    openDropdownId: string | null;
    setOpenDropdownId: (id: string | null) => void;
}

export const PromptsTab: FC<PromptsTabProps> = ({
    localSettings,
    setLocalSettings,
    activeProfile,
    isEditingProfileName,
    isModelUnlocked,
    setIsEditingProfileName,
    handleRenameProfile,
    handleProfileChange,
    handleCreateProfile,
    handleDeleteProfile,
    setEditingInstruction,
    openDropdownId,
    setOpenDropdownId
}) => {
    return (
        <div className="settings-section fade-in">
            <ProfileHeader
                label="Active Profile"
                profiles={localSettings.profiles}
                activeId={localSettings.activeProfileId}
                isEditing={isEditingProfileName}
                activeName={activeProfile.name}
                onProfileChange={handleProfileChange}
                onRename={handleRenameProfile}
                onStartEditing={() => setIsEditingProfileName(true)}
                onStopEditing={() => setIsEditingProfileName(false)}
                onCreate={handleCreateProfile}
                onDelete={handleDeleteProfile}
                canDelete={localSettings.profiles.length > 1}
                isSelectorOpen={openDropdownId === 'prompt-profile'}
                onSelectorOpenChange={(open) => setOpenDropdownId(open ? 'prompt-profile' : null)}
            />

            <div className="modal-card-container">
                <div className="modal-card-header">
                    <h4 className="modal-card-title">System Instructions</h4>
                </div>
                <div className="modal-card-content">
                    <div className="modal-section-list">
                        {([PROMPT_TYPES.INITIAL, PROMPT_TYPES.REFINEMENT, PROMPT_TYPES.SYNTHESIS] as const).map((id, index) => (
                            <InstructionItem
                                key={id}
                                index={index}
                                label={INSTRUCTION_METADATA[id].label}
                                help={INSTRUCTION_METADATA[id].help}
                                model={localSettings[INSTRUCTION_METADATA[id].modelKey] as string}
                                provider={localSettings.provider}
                                onEdit={() => setEditingInstruction(id)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
