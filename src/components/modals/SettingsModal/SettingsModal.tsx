import React, { type FC, useState, useEffect, useMemo } from 'react';
import { type AppSettings, PROMPT_TYPES, ProviderType } from '@/types';
import { DEFAULT_SETTINGS, MAX_OUTPUT_TOKENS_LIMIT } from '@/constants';
import { useProviderInfo, getProviderInfo } from '@/hooks/core/useProviderInfo';

// Shared Components
import { RoleAndPromptConfigModal, BaseModal, ConfirmationModal } from '@/components/modals';

// Local parts
import { type SettingsModalProps, type InstructionType } from '@/components/modals/SettingsModal/types';
import { useProfileManagement } from '@/components/modals/SettingsModal/hooks/useProfileManagement';
import { useRoleManagement } from '@/components/modals/SettingsModal/hooks/useRoleManagement';
import { usePresetManagement } from '@/components/modals/SettingsModal/hooks/usePresetManagement';
import { INSTRUCTION_METADATA } from '@/components/modals/SettingsModal/constants';
import { GeneralSettingsTab } from '@/components/modals/SettingsModal/tabs/GeneralSettingsTab';
import { PromptsTab } from '@/components/modals/SettingsModal/tabs/PromptsTab';
import { RolesTab } from '@/components/modals/SettingsModal/tabs/RolesTab';
import { ConfigIcon, PromptsIcon, RolesIcon } from '@/components/modals/SettingsModal/icons';

// Hooks & Utils
import { persistProviderModels, updateStepModel } from '@/utils/settings/providerPersistence';
import { createErrorHandler } from '@shared/utils/errorHandler';

import './SettingsModal.css';

export const SettingsModal: FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, onReset, serverStatus, onShowError }) => {
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const showError = createErrorHandler(onShowError);

    const [activeTab, setActiveTab] = useState<'general' | 'prompts' | 'roles'>('general');
    
    // UI states
    const [isEditingRoleName, setIsEditingRoleName] = useState(false);
    const [isEditingProfileName, setIsEditingProfileName] = useState(false);
    const [activeRoleType, setActiveRoleType] = useState<'drafter' | 'critic'>('drafter');
    const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
    const [editingInstruction, setEditingInstruction] = useState<InstructionType | null>(null);
    
    // Preset states
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [showConfirmClose, setShowConfirmClose] = useState(false);
    const [roleIndexToDelete, setRoleIndexToDelete] = useState<number | null>(null);
    const [showConfirmReset, setShowConfirmReset] = useState(false);
    const [showCreateProfileConfirm, setShowCreateProfileConfirm] = useState(false);
    const [showCreateRoleProfileConfirm, setShowCreateRoleProfileConfirm] = useState(false);

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

    useEffect(() => {
        setOpenDropdownId(null);
    }, [activeTab]);

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
    
    // Use the hook for local settings derived info
    const localProviderInfo = useProviderInfo(localSettings, serverStatus);
    const { isUnlocked: isModelUnlocked, isDemoMode: currentIsDemoMode } = localProviderInfo;

    // Hooks
    const profileMgr = useProfileManagement(localSettings, setLocalSettings, activeProfile, activeRoleProfile, setIsEditingProfileName, setIsEditingRoleName, onShowError);
    const roleMgr = useRoleManagement(localSettings, setLocalSettings, activeRoleProfile, activeRoleType, onShowError);
    const presetMgr = usePresetManagement(localSettings, setLocalSettings, activeProfile);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        
        if (name === 'provider') {
            setLocalSettings(prev => persistProviderModels(prev, value as ProviderType));
            return;
        }
        
        // Normal handling for other fields
        setLocalSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (name === 'numAgents' || name === 'maxOutputTokens' ? parseInt(value) || 1 : name === 'temperature' ? parseFloat(value) : value)
        }));
    };

    const handleSave = () => {
        const finalSettings = { ...localSettings };
        
        // Calculate unlocked and demo state for the selected provider
        const finalProviderInfo = getProviderInfo(finalSettings, serverStatus);
        const isUnlockedFinal = finalProviderInfo.isUnlocked;
        const isDemoFinal = finalProviderInfo.isDemoMode;
        
        // ===== VALIDATION: Check for required API keys =====
        // This prevents AiProviderFactory from throwing errors and causing white screen of death
        // We must ensure EITHER user has their own key OR server has a key configured (or env variable in dev)
        if (finalSettings.provider === ProviderType.OpenRouter) {
            // Check if ANY API key is available (user's or server's)
            if (!finalSettings.openRouterApiKey && !isUnlockedFinal) {
                const errorMsg = 'OpenRouter requires an API key. Please add your own API key in settings, or ensure the server has one configured.';
                showError(errorMsg);
                return; // Block saving - this is a critical error
            }
        } else if (finalSettings.provider === ProviderType.Gemini) {
            // Check if ANY API key is available (user's, server's, or environment variable in dev mode)
            // Note: isUnlockedFinal is the single source of truth - it returns true if:
            // 1. User has apiKey
            // 2. OR Proxy is active and server has key
            // 3. OR Direct mode is active and process.env.GEMINI_API_KEY exists
            if (!finalSettings.apiKey && !isUnlockedFinal) {
                const errorMsg = 'Gemini requires an API key. Please add your own API key in settings, or ensure the server has one configured.';
                showError(errorMsg);
                return; // Block saving - this is a critical error
            }
        }
        
        if (!isUnlockedFinal || isDemoFinal) {
            // Force default model in demo or no-key mode
            if (finalSettings.provider === ProviderType.Gemini) {
                finalSettings.model = 'gemini-2.5-flash-lite';
            } else if (finalSettings.provider === ProviderType.OpenRouter && isDemoFinal) {
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
        if (finalSettings.maxOutputTokens > MAX_OUTPUT_TOKENS_LIMIT) finalSettings.maxOutputTokens = MAX_OUTPUT_TOKENS_LIMIT;
        if (finalSettings.maxOutputTokens < 1) finalSettings.maxOutputTokens = 1;

        // Provider switching logic handles all model persistence
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
            hasActiveDropdown={openDropdownId !== null}
            onCloseDropdowns={() => {
                setOpenDropdownId(null);
            }}
            onEscape={() => {
                if (openDropdownId) {
                    setOpenDropdownId(null);
                    return;
                }

                handleClose();
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
                        {tab === 'general' && <ConfigIcon />}
                        {tab === 'prompts' && <PromptsIcon />}
                        {tab === 'roles' && <RolesIcon />}
                        <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
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
                        handleCreateProfile={() => setShowCreateProfileConfirm(true)}
                        handleDeleteProfile={profileMgr.handleDeleteProfile}
                        setEditingInstruction={setEditingInstruction}
                        openDropdownId={openDropdownId}
                        setOpenDropdownId={setOpenDropdownId}
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
                        handleCreateRoleProfile={() => setShowCreateRoleProfileConfirm(true)}
                        handleDeleteRoleProfile={profileMgr.handleDeleteRoleProfile}
                        handleAddRole={roleMgr.handleAddRole}
                        handleDeleteRole={(index) => setRoleIndexToDelete(index)}
                        handleMoveRole={roleMgr.handleMoveRole}
                        handleRestoreDefaultRoles={roleMgr.handleRestoreDefaultRoles}
                        setEditingRoleIndex={setEditingRoleIndex}
                        setLocalSettings={setLocalSettings}
                        openDropdownId={openDropdownId}
                        setOpenDropdownId={setOpenDropdownId}
                    />
                )}
                
                {/* Sub-modals are rendered inside the container to benefit from BaseModal logic if they were part of it,
                    but since they are conditional, they will render their own BaseModal via RoleAndPromptConfigModal.
                    This handles nesting correctly because useModalGlobalHandlers uses ref-counting. */}
                {editingRoleIndex !== null && (
                    <RoleAndPromptConfigModal
                        isOpen={true}
                        onClose={() => { setEditingRoleIndex(null); }}
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
                        onClose={() => { setEditingInstruction(null); }}
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
                        onSavePreset={(name) => presetMgr.handleSaveInstructionPreset(editingInstruction, name)}
                        modelValue={(localSettings[INSTRUCTION_METADATA[editingInstruction].modelKey] as string) || ''}
                        isModelUnlocked={isModelUnlocked}
                        isDemoMode={currentIsDemoMode}
                        onModelChange={(model) => {
                            const modelKey = INSTRUCTION_METADATA[editingInstruction!].modelKey as 'initialModel' | 'refinementModel' | 'synthesisModel';
                            
                            const result = updateStepModel(localSettings, modelKey, model || undefined);
                            
                            if (result.success) {
                                setLocalSettings(result.settings);
                            } else {
                                showError(result.error || 'Failed to update step model. Please try again.');
                            }
                        }}
                    />
                )}
            </BaseModal.Body>

            <BaseModal.Footer>
                <button className="modal-btn reset" onClick={() => setShowConfirmReset(true)}>Reset to Defaults</button>
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
        
        {roleIndexToDelete !== null && (
            <ConfirmationModal
                isOpen={true}
                title="Delete Role"
                message={<>Are you sure you want to delete the role <strong>"{((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [])[roleIndexToDelete]?.name || 'Unnamed Role'}"</strong>?</>}
                confirmLabel="Delete"
                confirmVariant="danger"
                cancelLabel="Cancel"
                onConfirm={() => {
                    roleMgr.handleDeleteRole(roleIndexToDelete);
                    setRoleIndexToDelete(null);
                }}
                onCancel={() => setRoleIndexToDelete(null)}
            />
        )}
        
        {showConfirmReset && (
            <ConfirmationModal
                isOpen={true}
                title="Reset Settings"
                message="Are you sure you want to reset all settings to defaults? This will clear your saved configuration."
                confirmLabel="Reset Everything"
                confirmVariant="danger"
                cancelLabel="Cancel"
                onConfirm={() => {
                    setShowConfirmReset(false);
                    onReset(); // Immediately clears localStorage and resets state
                    onClose();
                }}
                onCancel={() => setShowConfirmReset(false)}
            />
        )}

        {showCreateProfileConfirm && (
            <ConfirmationModal
                isOpen={true}
                title="Create New Profile"
                message="Would you like to create a completely new profile or a copy of the current one?"
                confirmLabel="Copy Current"
                discardLabel="Completely New"
                cancelLabel="Cancel"
                onConfirm={() => {
                    profileMgr.handleCreateProfile(true);
                    setShowCreateProfileConfirm(false);
                }}
                onDiscard={() => {
                    profileMgr.handleCreateProfile(false);
                    setShowCreateProfileConfirm(false);
                }}
                onCancel={() => setShowCreateProfileConfirm(false)}
            />
        )}

        {showCreateRoleProfileConfirm && (
            <ConfirmationModal
                isOpen={true}
                title="Create New Role Set"
                message="Would you like to create a completely new role set or a copy of the current one?"
                confirmLabel="Copy Current"
                discardLabel="Completely New"
                cancelLabel="Cancel"
                onConfirm={() => {
                    profileMgr.handleCreateRoleProfile(true);
                    setShowCreateRoleProfileConfirm(false);
                }}
                onDiscard={() => {
                    profileMgr.handleCreateRoleProfile(false);
                    setShowCreateRoleProfileConfirm(false);
                }}
                onCancel={() => setShowCreateRoleProfileConfirm(false)}
            />
        )}
        </>
    );
};
