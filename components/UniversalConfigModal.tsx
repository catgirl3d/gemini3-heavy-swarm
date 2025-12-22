import React, { FC, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalGlobalHandlers } from '../hooks/useModalGlobalHandlers';

export interface ModalField {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type: 'input' | 'textarea';
    placeholder?: string;
    autoFocus?: boolean;
}

export interface Preset {
    id: string;
    name: string;
    instruction: string;
    isCustom: boolean;
}

export interface UniversalConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    fields: ModalField[];
    presets: Preset[];
    onApplyPreset: (preset: Preset) => void;
    onDeletePreset: (id: string) => void;
    isDropdownOpen: boolean;
    setIsDropdownOpen: (open: boolean) => void;
    onSavePreset: (name: string) => void;
    extraActions?: React.ReactNode;
}

export const UniversalConfigModal: FC<UniversalConfigModalProps> = ({
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
    extraActions
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [presetName, setPresetName] = useState('');

    useModalGlobalHandlers({
        isOpen,
        onEscape: onClose,
        clickOutsideSelectors: ['.preset-menu-container'],
        onCloseDropdowns: () => setIsDropdownOpen(false)
    });

    if (!isOpen) return null;

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

    return createPortal(
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-container settings-modal role-edit-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-modal-button" onClick={handleClose}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>
                <div className="modal-body">
                    <div className="modal-form-group horizontal align-center space-between">
                        <label className="modal-label no-margin">Load from Preset</label>
                        <div className="preset-menu-container">
                            <button
                                className={`preset-menu-trigger ${isDropdownOpen ? 'active' : ''}`}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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

                            {isDropdownOpen && (
                                <div className="preset-menu-dropdown modal-dropdown">
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
                            )}
                        </div>
                    </div>

                    <div className="modal-divider"></div>

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
                </div>

                <div className="modal-footer space-between">
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
                </div>
            </div>
        </div>,
        document.body
    );
};
