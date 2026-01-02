import React, { FC, useState, useRef, useEffect } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';
import { RoleAndPromptConfigModalProps } from '@/components/modals/RoleAndPromptConfigModal/types';
import { PortalDropdown, ModelSelector } from '@/components/ui';
import { ProviderType } from '@/types';
import { AVAILABLE_MODELS } from '@/components/modals/SettingsModal/constants';
import './RoleAndPromptConfigModal.css';

// Stable reference to prevent click listener churn
// Include portal wrapper so clicks inside the portaled dropdown aren't treated as "outside"
const CLICK_OUTSIDE_SELECTORS = ['.preset-menu-container', '.model-selector-container', '.modal-dropdown-portal'];

export const RoleAndPromptConfigModal: FC<RoleAndPromptConfigModalProps> = ({
    isOpen,
    onClose,
    title,
    fields,
    presets,
    onApplyPreset,
    onDeletePreset,
    isDropdownOpen,
    setIsDropdownOpen,
    onSavePreset,
    extraActions,
    modelValue,
    isModelUnlocked = true,
    onModelChange,
    provider = ProviderType.Gemini,
    isDemoMode = false
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [presetName, setPresetName] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Reset local state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setIsSaving(false);
            setPresetName('');
            setIsModelSelectorOpen(false);
        }
    }, [isOpen]);

    const handleClose = () => {
        setIsSaving(false);
        setPresetName('');
        onClose();
    };

    const handleSavePreset = () => {
        if (presetName.trim()) {
            onSavePreset(presetName.trim());
            setPresetName('');
            setIsSaving(false);
        }
    };

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={handleClose}
            size="md"
            className="role-edit-modal"
            clickOutsideSelectors={CLICK_OUTSIDE_SELECTORS}
            onCloseDropdowns={() => {
                setIsDropdownOpen(false);
                setIsModelSelectorOpen(false);
            }}
            onEscape={() => {
                if (isDropdownOpen) setIsDropdownOpen(false);
                else if (isModelSelectorOpen) setIsModelSelectorOpen(false);
                else handleClose();
            }}
        >
            <BaseModal.Header title={title} onClose={handleClose} />
            <BaseModal.Body>
                <div className="modal-form-group horizontal align-center space-between">
                    <label className="modal-label no-margin">Load from Preset</label>
                    <div className="preset-menu-container">
                        <button
                            ref={triggerRef}
                            className={`preset-menu-trigger ${isDropdownOpen ? 'active' : ''}`}
                            onClick={() => setIsDropdownOpen(prev => !prev)}
                            disabled={presets.length === 0}
                            title={presets.length === 0 ? "No presets available" : "Load from a saved preset"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            <span>{presets.length === 0 ? 'No Presets Available' : 'Select a Preset...'}</span>
                            <svg className={`chevron ${isDropdownOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>

                        <PortalDropdown
                            isOpen={isDropdownOpen}
                            triggerRef={triggerRef}
                            width={300}
                        >
                            <div className="preset-menu-dropdown">
                                <div className="preset-menu-header">Presets</div>
                                {presets.map((p) => (
                                    <div key={p.id} className="preset-menu-item-wrapper">
                                        <button
                                            className="preset-menu-item"
                                            onClick={() => {
                                                onApplyPreset(p);
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            <div className="preset-name">
                                                {p.name}
                                                {p.isCustom && <span className="preset-tag">Saved</span>}
                                            </div>
                                        </button>
                                        {p.isCustom && (
                                            <button
                                                className="preset-delete-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeletePreset(p.id);
                                                    setIsDropdownOpen(false);
                                                }}
                                                title="Delete Preset"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </PortalDropdown>
                    </div>
                </div>

                {onModelChange && (
                    <>
                        <BaseModal.Divider />
                        <div className="modal-form-group">
                            <label className="modal-label">Model for this Step</label>
                            {/* Type-safe: onModelChange is guaranteed to be defined within this conditional block */}
                            <ModelSelector
                                provider={provider}
                                value={(!isModelUnlocked || (provider === ProviderType.Gemini && isDemoMode)) ? (provider === ProviderType.OpenRouter ? '' : 'gemini-2.5-flash-lite') : (modelValue || '')}
                                onChange={onModelChange}
                                isOpen={isModelSelectorOpen}
                                onOpenChange={setIsModelSelectorOpen}
                                placeholder="Use Global Model"
                                disabled={!isModelUnlocked || (provider === ProviderType.Gemini && isDemoMode)}
                                showEmptyOption={true}
                                emptyLabel="Use Global Model"
                                isDemoMode={isDemoMode}
                            />
                            <p className="modal-help-text">
                                Select 'Use Global Model' to use the global model from General settings.
                            </p>
                            {isDemoMode && provider === ProviderType.Gemini && (
                                <p className="modal-help-text warning">
                                    Only Gemini 2.5 Flash-Lite is available in Demo Mode. Add an API key to unlock all models.
                                </p>
                            )}
                            {isDemoMode && provider === ProviderType.OpenRouter && (
                                <p className="modal-help-text warning">
                                    Demo Mode: Only free models are available.
                                </p>
                            )}
                            {!isModelUnlocked && !isDemoMode && (
                                <p className="modal-help-text danger">
                                    No API key available.
                                </p>
                            )}
                        </div>
                    </>
                )}

                <BaseModal.Divider />

                {fields.map((field, idx) => (
                    <div className="modal-form-group" key={idx}>
                        <label className="modal-label">{field.label}</label>
                        {field.type === 'input' ? (
                            <input
                                type="text"
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="modal-input"
                                placeholder={field.placeholder}
                                autoFocus={field.autoFocus && !isSaving}
                            />
                        ) : (
                            <textarea
                                value={field.value}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="modal-textarea role-instruction-textarea-large"
                                placeholder={field.placeholder}
                                autoFocus={field.autoFocus && !isSaving}
                            />
                        )}
                    </div>
                ))}
            </BaseModal.Body>

            <BaseModal.Footer>
                <div className="save-preset-container">
                    {isSaving ? (
                        <div className="save-preset-input-group">
                            <input
                                type="text"
                                placeholder="Preset Name"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                className="modal-input"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSavePreset();
                                    if (e.key === 'Escape') setIsSaving(false);
                                }}
                            />
                            <button className="modal-icon-btn save-confirm-btn" onClick={handleSavePreset} disabled={!presetName.trim()}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </button>
                            <button className="modal-icon-btn save-cancel-btn" onClick={() => setIsSaving(false)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button className="modal-btn outline" onClick={() => setIsSaving(true)}>
                            Save as Preset
                        </button>
                    )}
                </div>
                <div className="modal-actions-right">
                    {extraActions}
                    <button className="modal-btn save" onClick={handleClose}>Done</button>
                </div>
            </BaseModal.Footer>
        </BaseModal>
    );
};
