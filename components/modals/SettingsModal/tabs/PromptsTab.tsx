import React, { FC, ChangeEvent } from 'react';
import { AppSettings, PromptProfile, PROMPT_TYPES } from '@/types';
import { ProfileHeader } from '@/components/modals/SettingsModal/components/ProfileHeader';
import { InstructionItem } from '@/components/modals/SettingsModal/components/InstructionItem';
import { INSTRUCTION_METADATA } from '@/components/modals/SettingsModal/constants';
import { InstructionType } from '@/components/modals/SettingsModal/types';

interface PromptsTabProps {
    localSettings: AppSettings;
    activeProfile: PromptProfile;
    isEditingProfileName: boolean;
    setIsEditingProfileName: (val: boolean) => void;
    handleRenameProfile: (name: string) => void;
    handleProfileChange: (e: ChangeEvent<HTMLSelectElement>) => void;
    handleCreateProfile: () => void;
    handleDeleteProfile: () => void;
    setEditingInstruction: (type: InstructionType | null) => void;
}

export const PromptsTab: FC<PromptsTabProps> = ({
    localSettings,
    activeProfile,
    isEditingProfileName,
    setIsEditingProfileName,
    handleRenameProfile,
    handleProfileChange,
    handleCreateProfile,
    handleDeleteProfile,
    setEditingInstruction
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
            />

            <div className="roles-section-wrapper">
                <div className="roles-toolbar">
                    <h4 className="modal-section-title">System Instructions</h4>
                </div>
                <div className="roles-list-container">
                    <div className="roles-list">
                        {([PROMPT_TYPES.INITIAL, PROMPT_TYPES.REFINEMENT, PROMPT_TYPES.SYNTHESIS] as const).map((id, index) => (
                            <InstructionItem
                                key={id}
                                index={index}
                                label={INSTRUCTION_METADATA[id].label}
                                help={INSTRUCTION_METADATA[id].help}
                                onEdit={() => setEditingInstruction(id)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
