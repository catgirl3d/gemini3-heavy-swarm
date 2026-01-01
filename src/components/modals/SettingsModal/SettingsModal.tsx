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
import { INSTRUCTION_METADATA } from '@/components/modals/SettingsModal/constants';
import { GeneralSettingsTab } from '@/components/modals/SettingsModal/tabs/GeneralSettingsTab';
import { PromptsTab } from '@/components/modals/SettingsModal/tabs/PromptsTab';
import { RolesTab } from '@/components/modals/SettingsModal/tabs/RolesTab';

import './SettingsModal.css';

/**
 * Determines if a model is unlocked based on the provider and available keys.
 * A model is unlocked if either the user has provided their own API key,
 * or if the server has a key configured.
 * 
 * @param provider - The AI provider to check ('gemini' or 'openrouter')
 * @param hasUserKey - Whether the user has provided their own API key
 * @param hasServerKey - Whether the server has a key configured
 * @returns true if the model is unlocked (either user or server has a key)
 */
function isModelUnlockedForProvider(
    provider: 'gemini' | 'openrouter',
    hasUserKey: boolean,
    hasServerKey: boolean
): boolean {
    return hasUserKey || hasServerKey;
}

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
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
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
    const isUsingProxy = localSettings.provider === 'openrouter' ? !localSettings.openRouterApiKey : checkProxyUsage(localSettings.apiKey);
    const isModelUnlocked = isModelUnlockedForProvider(
        localSettings.provider,
        localSettings.provider === 'openrouter' ? !!localSettings.openRouterApiKey : !!localSettings.apiKey,
        localSettings.provider === 'openrouter' ? !!serverStatus?.hasOpenRouterKey : !!serverStatus?.hasServerKey
    );

    const currentIsDemoMode = localSettings.provider === 'openrouter'
        ? (!localSettings.openRouterApiKey && !!serverStatus?.hasOpenRouterKey && serverStatus?.proxyMode !== 'private')
        : (!localSettings.apiKey && !!serverStatus?.hasServerKey && serverStatus?.proxyMode !== 'private');

    // Hooks
    const profileMgr = useProfileManagement(localSettings, setLocalSettings, activeProfile, activeRoleProfile, setIsEditingProfileName, setIsEditingRoleName);
    const roleMgr = useRoleManagement(localSettings, setLocalSettings, activeRoleProfile, activeRoleType);
    const presetMgr = usePresetManagement(localSettings, setLocalSettings, activeProfile);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setLocalSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (name === 'numAgents' || name === 'maxOutputTokens' ? parseInt(value) || 1 : name === 'temperature' ? parseFloat(value) : value)
        }));
    };

    const handleSave = () => {
        const finalSettings = { ...localSettings };
        
        // Calculate unlocked and demo state for the selected provider
        const hasUserKeyFinal = finalSettings.provider === 'openrouter' ? !!finalSettings.openRouterApiKey : !!finalSettings.apiKey;
        const hasServerKeyFinal = finalSettings.provider === 'openrouter' ? !!serverStatus?.hasOpenRouterKey : !!serverStatus?.hasServerKey;
        const isUnlockedFinal = isModelUnlockedForProvider(finalSettings.provider, hasUserKeyFinal, hasServerKeyFinal);
        const isDemoFinal = !hasUserKeyFinal && hasServerKeyFinal && serverStatus?.proxyMode !== 'private';
        
        if (!isUnlockedFinal || isDemoFinal) {
            // Force default model in demo or no-key mode
            if (finalSettings.provider === 'gemini') {
                finalSettings.model = 'gemini-2.5-flash-lite';
            } else if (finalSettings.provider === 'openrouter' && isDemoFinal) {
                // In demo mode, clear OpenRouter model if it's not a free model
                const currentModel = finalSettings.openRouterModel || '';
                if (currentModel && !currentModel.endsWith(':free')) {
                    finalSettings.openRouterModel = '';
                }
            }
            
            // Reset step-specific models to fallback to global
            finalSettings.initialModel = undefined;
            finalSettings.refinementModel = undefined;
            finalSettings.synthesisModel = undefined;

            // Reset models in all role profiles
            if (finalSettings.roleProfiles) {
                finalSettings.roleProfiles = finalSettings.roleProfiles.map(profile => ({
                    ...profile,
                    roles: profile.roles.map(role => ({ ...role, model: undefined })),
                    criticRoles: profile.criticRoles?.map(role => ({ ...role, model: undefined }))
                }));
            }

            // Reset models in saved presets
            if (finalSettings.savedInstructions) {
                finalSettings.savedInstructions = finalSettings.savedInstructions.map(i => ({ ...i, model: undefined }));
            }
            if (finalSettings.savedRoles) {
                finalSettings.savedRoles = finalSettings.savedRoles.map(r => ({ ...r, model: undefined }));
            }
        }

        // Validation: Ensure error simulation attempts are at least 1
        if (finalSettings.simulateInitialErrorAttempts < 1) finalSettings.simulateInitialErrorAttempts = 1;
        if (finalSettings.simulateRefinementErrorAttempts < 1) finalSettings.simulateRefinementErrorAttempts = 1;
        if (finalSettings.simulateSynthesisErrorAttempts < 1) finalSettings.simulateSynthesisErrorAttempts = 1;

        // Validation: Max output tokens limits
        if (finalSettings.maxOutputTokens > 65536) finalSettings.maxOutputTokens = 65536;
        if (finalSettings.maxOutputTokens < 1) finalSettings.maxOutputTokens = 1;

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
            clickOutsideSelectors={['.model-selector-container', '.modal-dropdown-portal']}
            onCloseDropdowns={() => {
                setOpenDropdownId(null);
                setIsRolePresetDropdownOpen(false);
                setIsInstructionPresetDropdownOpen(false);
            }}
            onEscape={() => {
                if (openDropdownId) setOpenDropdownId(null);
                else if (isRolePresetDropdownOpen) setIsRolePresetDropdownOpen(false);
                else if (isInstructionPresetDropdownOpen) setIsInstructionPresetDropdownOpen(false);
                else handleClose();
            }}
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
                        serverStatus={serverStatus}
                        openDropdownId={openDropdownId}
                        setOpenDropdownId={setOpenDropdownId}
                    />
                )}
                {activeTab === 'prompts' && (
                    <PromptsTab
                        localSettings={localSettings}
                        setLocalSettings={setLocalSettings}
                        activeProfile={activeProfile}
                        isEditingProfileName={isEditingProfileName}
                        isModelUnlocked={isModelUnlocked}
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
                        handleRestoreDefaultRoles={roleMgr.handleRestoreDefaultRoles}
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
                        provider={localSettings.provider}
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
                        onApplyPreset={(p) => roleMgr.handleApplyRole(editingRoleIndex, { name: p.name, instruction: p.instruction, model: p.model })}
                        onDeletePreset={presetMgr.handleDeleteRolePreset}
                        isDropdownOpen={isRolePresetDropdownOpen}
                        setIsDropdownOpen={setIsRolePresetDropdownOpen}
                        onSavePreset={(name) => presetMgr.handleSaveRolePreset(editingRoleIndex, activeRoleType, activeRoleProfile, name)}
                        modelValue={((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [])[editingRoleIndex]?.model || ''}
                        isModelUnlocked={isModelUnlocked}
                        isDemoMode={currentIsDemoMode}
                        onModelChange={(model) => roleMgr.handleRoleChange(editingRoleIndex, 'model', model)}
                    />
                )}

                {editingInstruction !== null && (
                    <RoleAndPromptConfigModal
                        isOpen={true}
                        onClose={() => { setEditingInstruction(null); setIsInstructionPresetDropdownOpen(false); }}
                        provider={localSettings.provider}
                        title={`Configure ${editingInstruction.replace('_prompt', '').charAt(0).toUpperCase() + editingInstruction.replace('_prompt', '').slice(1)} Instruction`}
                        fields={[{
                            label: "Instruction",
                            value: editingInstruction === PROMPT_TYPES.INITIAL ? activeProfile.initialInstruction : editingInstruction === PROMPT_TYPES.REFINEMENT ? activeProfile.refinementInstruction : activeProfile.synthesizerInstruction,
                            onChange: (val) => presetMgr.handleApplyInstructionPreset(editingInstruction, val),
                            type: 'textarea', placeholder: "Enter instructions...", autoFocus: true
                        }]}
                        presets={presetMgr.getInstructionPresets(editingInstruction)}
                        onApplyPreset={(p) => presetMgr.handleApplyInstructionPreset(editingInstruction, p.instruction, p.model)}
                        onDeletePreset={presetMgr.handleDeleteInstructionPreset}
                        isDropdownOpen={isInstructionPresetDropdownOpen}
                        setIsDropdownOpen={setIsInstructionPresetDropdownOpen}
                        onSavePreset={(name) => presetMgr.handleSaveInstructionPreset(editingInstruction, name)}
                        modelValue={(localSettings[INSTRUCTION_METADATA[editingInstruction].modelKey] as string) || ''}
                        isModelUnlocked={isModelUnlocked}
                        isDemoMode={currentIsDemoMode}
                        onModelChange={(model) => {
                            setLocalSettings(prev => ({
                                ...prev,
                                [INSTRUCTION_METADATA[editingInstruction!].modelKey]: model || undefined
                            }));
                        }}
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
