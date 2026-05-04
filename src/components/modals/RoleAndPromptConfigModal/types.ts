import { type ProviderType } from '@/types';

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
    model?: string;
}

export interface RoleAndPromptConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    fields: ModalField[];
    presets: Preset[];
    onApplyPreset: (preset: Preset) => void;
    onDeletePreset: (id: string) => void;
    onSavePreset: (name: string) => void;
    extraActions?: React.ReactNode;
    modelValue?: string;
    isModelUnlocked?: boolean;
    onModelChange?: (model: string) => void;
    provider?: ProviderType;
    isDemoMode?: boolean;
}
