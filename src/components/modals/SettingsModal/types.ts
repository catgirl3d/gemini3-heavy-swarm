import { AppSettings, PromptTypeId, ServerStatus } from '@/types';

export interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSave: (newSettings: AppSettings) => void;
    serverStatus?: ServerStatus;
}

export type TabType = 'general' | 'prompts' | 'roles';
export type RoleType = 'drafter' | 'critic';
export type InstructionType = PromptTypeId;

export interface ProfileMetadata {
    id: InstructionType;
    label: string;
    help: string;
    modelKey: keyof AppSettings;
}
