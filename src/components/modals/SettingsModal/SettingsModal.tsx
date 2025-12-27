import React, { FC, useState, useEffect, useMemo } from 'react';
import { AppSettings, PROMPT_TYPES } from '@/types';
import { DEFAULT_SETTINGS, IS_FORCED_PROXY } from '@/constants';
import { isUsingProxy as checkProxyUsage } from '@/services/proxy/proxyUtils';

import { RoleAndPromptConfigModal, BaseModal, ConfirmationModal } from '@/components/modals';

// Local parts
import { SettingsModalProps, InstructionType } from '@/components/modals/SettingsModal/types';
import { useProfileManagement } from '@/components/modals/SettingsModal/hooks/useProfileManagement';
import { useRoleManagement } from '@/components/modals/SettingsModal/hooks/useRoleManagement';
import { usePresetManagement } from '@/components/modals/SettingsModal/hooks/usePresetManagement';
import { GeneralSettingsTab } from '@/components/modals/SettingsModal/tabs/GeneralSettingsTab';
import { PromptsTab } from '@/components/modals/SettingsModal/tabs/PromptsTab';
import { RolesTab } from '@/components/modals/SettingsModal/tabs/RolesTab';

import './SettingsModal.css';

export const SettingsModal: FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, serverStatus }) => {
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [activeTab, setActiveTab] = useState<'general' | 'prompts' | 'roles'>('general');
    
    // UI states
    const [isEditingRoleName, setIsEditingRoleName] = useState(false);
    const [isEditingProfileName, setIsEditingProfileName] = useState(false);
    const [activeRoleType, setActiveRoleType] = useState<'drafter' | 'critic'>('drafter');
    const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
    const [editingInstruction, setEditingInstruction] = useState<InstructionType | null>(null);
    
    // Preset states
    const [isRolePresetDropdownOpen, setIsRolePresetDropdownOpen] = useState(false);
    const [isInstructionPresetDropdownOpen, setIsInstructionPresetDropdownOpen] = useState(false);
    const [showConfirmClose, setShowConfirmClose] = useState(false);

    const hasChanges = useMemo(() => {
        try {
            return JSON.stringify(localSettings) !== JSON.stringify(settings);
        } catch (e) {
            return true; // Fallback to safe side
        }
    }, [localSettings, settings]);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings, isOpen]);

    const handleClose = () => {
        if (hasChanges) {
            setShowConfirmClose(true);
        } else {
            onClose();
        }
    };

    // Derived values
    const activeProfile = localSettings.profiles?.find(p => p.id === localSettings.activeProfileId) || localSettings.profiles?.[0] || DEFAULT_SETTINGS.profiles[0];
    const activeRoleProfile = localSettings.roleProfiles?.find(p => p.id === localSettings.activeRoleProfileId) || localSettings.roleProfiles?.[0] || DEFAULT_SETTINGS.roleProfiles[0];
    const isUsingProxy = checkProxyUsage(localSettings.apiKey);
    const isModelUnlocked = !isUsingProxy || (serverStatus?.hasServerKey && serverStatus?.proxyMode === 'private');

    // Hooks
    const profileMgr = useProfileManagement(localSettings, setLocalSettings, activeProfile, activeRoleProfile, setIsEditingProfileName, setIsEditingRoleName);
    const roleMgr = useRoleManagement(localSettings, setLocalSettings, activeRoleProfile, activeRoleType);
    const presetMgr = usePresetManagement(localSettings, setLocalSettings, activeProfile);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setLocalSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (name === 'numAgents' ? parseInt(value) || 1 : name === 'temperature' ? parseFloat(value) : value)
        }));
    };

    const handleSave = () => {
        const finalSettings = { ...localSettings };
        const isUsingProxyFinal = checkProxyUsage(finalSettings.apiKey);
        const isUnlockedFinal = !isUsingProxyFinal || (serverStatus?.hasServerKey && serverStatus?.proxyMode === 'private');
        
        if (!isUnlockedFinal) finalSettings.model = 'gemini-2.5-flash-lite';
        onSave(finalSettings);
        onClose();
        setShowConfirmClose(false);
    };

    return (
        <>
        <BaseModal
            isOpen={isOpen}
            onClose={handleClose}
            size="lg"
            className=""
        >
            <BaseModal.Header title="Swarm Configuration" onClose={handleClose} />
            
            <div className="settings-tabs">
                {(['general', 'prompts', 'roles'] as const).map(tab => (
                    <button
                        key={tab}
                        className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <BaseModal.Body>
                {activeTab === 'general' && (
                    <GeneralSettingsTab
                        localSettings={localSettings}
                        handleChange={handleChange}
                        setLocalSettings={setLocalSettings}
                        isModelUnlocked={isModelUnlocked}
                    />
                )}
                {activeTab === 'prompts' && (
                    <PromptsTab
                        localSettings={localSettings}
                        activeProfile={activeProfile}
                        isEditingProfileName={isEditingProfileName}
                        setIsEditingProfileName={setIsEditingProfileName}
                        handleRenameProfile={profileMgr.handleRenameProfile}
                        handleProfileChange={profileMgr.handleProfileChange}
                        handleCreateProfile={profileMgr.handleCreateProfile}
                        handleDeleteProfile={profileMgr.handleDeleteProfile}
                        setEditingInstruction={setEditingInstruction}
                    />
                )}
                {activeTab === 'roles' && (
                    <RolesTab
                        localSettings={localSettings}
                        activeRoleProfile={activeRoleProfile}
                        isEditingRoleName={isEditingRoleName}
                        setIsEditingRoleName={setIsEditingRoleName}
                        activeRoleType={activeRoleType}
                        setActiveRoleType={setActiveRoleType}
                        handleRenameRoleProfile={profileMgr.handleRenameRoleProfile}
                        handleRoleProfileChange={profileMgr.handleRoleProfileChange}
                        handleCreateRoleProfile={profileMgr.handleCreateRoleProfile}
                        handleDeleteRoleProfile={profileMgr.handleDeleteRoleProfile}
                        handleAddRole={roleMgr.handleAddRole}
                        handleDeleteRole={roleMgr.handleDeleteRole}
                        handleMoveRole={roleMgr.handleMoveRole}
                        setEditingRoleIndex={setEditingRoleIndex}
                        setLocalSettings={setLocalSettings}
                    />
                )}
                
                {/* Sub-modals are rendered inside the container to benefit from BaseModal logic if they were part of it,
                    but since they are conditional, they will render their own BaseModal via RoleAndPromptConfigModal.
                    This handles nesting correctly because useModalGlobalHandlers uses ref-counting. */}
                {editingRoleIndex !== null && (
                    <RoleAndPromptConfigModal
                        isOpen={true}
                        onClose={() => { setEditingRoleIndex(null); setIsRolePresetDropdownOpen(false); }}
                        title={`Configure Role #${editingRoleIndex + 1}`}
                        fields={[
                            {
                                label: "Role Name",
                                value: ((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [])[editingRoleIndex]?.name || '',
                                onChange: (val) => roleMgr.handleRoleChange(editingRoleIndex, 'name', val),
                                type: 'input', placeholder: "e.g. Critic, Visionary", autoFocus: true
                            },
                            {
                                label: "Role Instruction",
                                value: ((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [])[editingRoleIndex]?.instruction || '',
                                onChange: (val) => roleMgr.handleRoleChange(editingRoleIndex, 'instruction', val),
                                type: 'textarea', placeholder: "Instructions for this specific role..."
                            }
                        ]}
                        presets={presetMgr.getRolePresets(activeRoleProfile.id, activeRoleType)}
                        onApplyPreset={(p) => roleMgr.handleApplyRole(editingRoleIndex, { name: p.name, instruction: p.instruction })}
                        onDeletePreset={presetMgr.handleDeleteRolePreset}
                        isDropdownOpen={isRolePresetDropdownOpen}
                        setIsDropdownOpen={setIsRolePresetDropdownOpen}
                        onSavePreset={(name) => presetMgr.handleSaveRolePreset(editingRoleIndex, activeRoleType, activeRoleProfile, name)}
                    />
                )}

                {editingInstruction !== null && (
                    <RoleAndPromptConfigModal
                        isOpen={true}
                        onClose={() => { setEditingInstruction(null); setIsInstructionPresetDropdownOpen(false); }}
                        title={`Configure ${editingInstruction.replace('_prompt', '').charAt(0).toUpperCase() + editingInstruction.replace('_prompt', '').slice(1)} Instruction`}
                        fields={[{
                            label: "Instruction",
                            value: editingInstruction === PROMPT_TYPES.INITIAL ? activeProfile.initialInstruction : editingInstruction === PROMPT_TYPES.REFINEMENT ? activeProfile.refinementInstruction : activeProfile.synthesizerInstruction,
                            onChange: (val) => presetMgr.handleApplyInstructionPreset(editingInstruction, val),
                            type: 'textarea', placeholder: "Enter instructions...", autoFocus: true
                        }]}
                        presets={presetMgr.getInstructionPresets(editingInstruction)}
                        onApplyPreset={(p) => presetMgr.handleApplyInstructionPreset(editingInstruction, p.instruction)}
                        onDeletePreset={presetMgr.handleDeleteInstructionPreset}
                        isDropdownOpen={isInstructionPresetDropdownOpen}
                        setIsDropdownOpen={setIsInstructionPresetDropdownOpen}
                        onSavePreset={(name) => presetMgr.handleSaveInstructionPreset(editingInstruction, name)}
                    />
                )}
            </BaseModal.Body>

            <BaseModal.Footer>
                <button className="modal-btn reset" onClick={() => setLocalSettings(DEFAULT_SETTINGS)}>Reset to Defaults</button>
                <button className="modal-btn save" onClick={handleSave}>Save Changes</button>
            </BaseModal.Footer>
        </BaseModal>
        
        {showConfirmClose && (
            <ConfirmationModal
                isOpen={true}
                title="Unsaved Changes"
                message="You have unsaved changes. Would you like to save them before closing?"
                confirmLabel="Save & Close"
                cancelLabel="Stay"
                discardLabel="Discard"
                onConfirm={handleSave}
                onCancel={() => setShowConfirmClose(false)}
                onDiscard={() => {
                    setShowConfirmClose(false);
                    onClose();
                }}
            />
        )}
        </>
    );
};
