import React, { FC, useState, useEffect } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';
import { RoleAndPromptConfigModalProps } from '@/components/modals/RoleAndPromptConfigModal/types';
import { ModelSelector, PresetSelector } from '@/components/ui';
import { ProviderType } from '@/types';
import './RoleAndPromptConfigModal.css';

type ActiveDropdown = 'model' | 'preset' | null;

export const RoleAndPromptConfigModal: FC<RoleAndPromptConfigModalProps> = ({
    isOpen,
    onClose,
    title,
    fields,
    presets,
    onApplyPreset,
    onDeletePreset,
    onSavePreset,
    extraActions,
    modelValue,
    isModelUnlocked = true,
    onModelChange,
    provider = ProviderType.Gemini,
    isDemoMode = false
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
    const [presetName, setPresetName] = useState('');

    // Reset local state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setIsSaving(false);
            setPresetName('');
            setActiveDropdown(null);
        }
    }, [isOpen]);

    const handleClose = () => {
        setIsSaving(false);
        setPresetName('');
        setActiveDropdown(null);
        onClose();
    };

    const handleSavePreset = () => {
        if (presetName.trim()) {
            onSavePreset(presetName.trim());
            setPresetName('');
            setIsSaving(false);
        }
    };

    const handlePresetDropdownOpenChange = (open: boolean) => {
        setActiveDropdown(open ? 'preset' : null);
    };

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={handleClose}
            size="md"
            className="role-edit-modal"
            hasActiveDropdown={activeDropdown !== null}
            onCloseDropdowns={() => {
                setActiveDropdown(null);
            }}
            onEscape={() => {
                if (activeDropdown) {
                    setActiveDropdown(null);
                    return;
                }

                handleClose();
            }}
        >
            <BaseModal.Header title={title} onClose={handleClose} />
            <BaseModal.Body>
                <div className="modal-form-group horizontal align-center space-between">
                    <label className="modal-label no-margin">Load from Preset</label>
                    <PresetSelector
                        presets={presets}
                        isOpen={activeDropdown === 'preset'}
                        onOpenChange={handlePresetDropdownOpenChange}
                        onSelect={(preset) => onApplyPreset(preset)}
                        onDeletePreset={(preset) => onDeletePreset(preset.id)}
                    />
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
                                isOpen={activeDropdown === 'model'}
                                onOpenChange={(open) => setActiveDropdown(current => open ? 'model' : current === 'model' ? null : current)}
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
