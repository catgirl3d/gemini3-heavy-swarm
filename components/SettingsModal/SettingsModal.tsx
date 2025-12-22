import React, { FC, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings } from '../../types';
import { DEFAULT_SETTINGS } from '../../constants';
import { UniversalConfigModal } from '../UniversalConfigModal';

// Local parts
import { SettingsModalProps } from './types';
import { CloseIcon } from './icons';
import { useProfileManagement } from './hooks/useProfileManagement';
import { useRoleManagement } from './hooks/useRoleManagement';
import { usePresetManagement } from './hooks/usePresetManagement';
import { GeneralSettingsTab } from './tabs/GeneralSettingsTab';
import { PromptsTab } from './tabs/PromptsTab';
import { RolesTab } from './tabs/RolesTab';

import '../Modal.css';
import './SettingsModal.css';

export const SettingsModal: FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, serverStatus }) => {
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [activeTab, setActiveTab] = useState<'general' | 'prompts' | 'roles'>('general');
    
    // UI states
    const [isEditingRoleName, setIsEditingRoleName] = useState(false);
    const [isEditingProfileName, setIsEditingProfileName] = useState(false);
    const [activeRoleType, setActiveRoleType] = useState<'drafter' | 'critic'>('drafter');
    const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
    const [editingInstruction, setEditingInstruction] = useState<'initial' | 'refinement' | 'synthesizer' | null>(null);
    
    // Preset states
    const [isRolePresetDropdownOpen, setIsRolePresetDropdownOpen] = useState(false);
    const [isInstructionPresetDropdownOpen, setIsInstructionPresetDropdownOpen] = useState(false);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings, isOpen]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editingRoleIndex !== null) {
                    setEditingRoleIndex(null);
                    setIsRolePresetDropdownOpen(false);
                } else if (editingInstruction !== null) {
                    setEditingInstruction(null);
                    setIsInstructionPresetDropdownOpen(false);
                } else {
                    onClose();
                }
            }
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return;
            if (isRolePresetDropdownOpen && !e.target.closest('.preset-menu-container')) setIsRolePresetDropdownOpen(false);
            if (isInstructionPresetDropdownOpen && !e.target.closest('.preset-menu-container')) setIsInstructionPresetDropdownOpen(false);
        };

        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            window.addEventListener('click', handleClickOutside, true);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleEsc);
            window.removeEventListener('click', handleClickOutside, true);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose, isRolePresetDropdownOpen, isInstructionPresetDropdownOpen, editingRoleIndex, editingInstruction]);

    // Derived values
    const activeProfile = localSettings.profiles?.find(p => p.id === localSettings.activeProfileId) || localSettings.profiles?.[0] || DEFAULT_SETTINGS.profiles[0];
    const activeRoleProfile = localSettings.roleProfiles?.find(p => p.id === localSettings.activeRoleProfileId) || localSettings.roleProfiles?.[0] || DEFAULT_SETTINGS.roleProfiles[0];
    const isModelUnlocked = !!localSettings.apiKey || !!process.env.GEMINI_API_KEY || (serverStatus?.hasServerKey && serverStatus?.proxyMode === 'private');

    // Hooks
    const profileMgr = useProfileManagement(localSettings, setLocalSettings, activeProfile, activeRoleProfile, setIsEditingProfileName, setIsEditingRoleName);
    const roleMgr = useRoleManagement(localSettings, setLocalSettings, activeRoleProfile, activeRoleType);
    const presetMgr = usePresetManagement(localSettings, setLocalSettings, activeProfile);

    if (!isOpen) return null;

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
        const hasKey = !!finalSettings.apiKey || !!process.env.GEMINI_API_KEY || (serverStatus?.hasServerKey && serverStatus?.proxyMode === 'private');
        if (!hasKey) finalSettings.model = 'gemini-2.5-flash-lite';
        onSave(finalSettings);
        onClose();
    };

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container settings-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Swarm Configuration</h3>
                    <button className="close-modal-button" onClick={onClose} aria-label="Close">
                        <CloseIcon />
                    </button>
                </div>

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

                <div className="modal-body">
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
                </div>

                <div className="modal-footer">
                    <button className="modal-btn reset" onClick={() => setLocalSettings(DEFAULT_SETTINGS)}>Reset to Defaults</button>
                    <button className="modal-btn save" onClick={handleSave}>Save Changes</button>
                </div>
            </div>

            {/* Sub-modals */}
            {editingRoleIndex !== null && (
                <UniversalConfigModal
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
                <UniversalConfigModal
                    isOpen={true}
                    onClose={() => { setEditingInstruction(null); setIsInstructionPresetDropdownOpen(false); }}
                    title={`Configure ${editingInstruction.charAt(0).toUpperCase() + editingInstruction.slice(1)} Instruction`}
                    fields={[{
                        label: "Instruction",
                        value: editingInstruction === 'initial' ? activeProfile.initialInstruction : editingInstruction === 'refinement' ? activeProfile.refinementInstruction : activeProfile.synthesizerInstruction,
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
        </div>,
        document.body
    );
};
