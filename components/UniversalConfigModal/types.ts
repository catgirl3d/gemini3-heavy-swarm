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
