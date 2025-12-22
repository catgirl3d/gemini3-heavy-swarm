import { AppSettings } from '../../types';

export interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSave: (newSettings: AppSettings) => void;
    serverStatus?: { hasServerKey: boolean; proxyMode: string };
}

export type TabType = 'general' | 'prompts' | 'roles';
export type RoleType = 'drafter' | 'critic';
export type InstructionType = 'initial' | 'refinement' | 'synthesizer';

export interface ProfileMetadata {
    id: InstructionType;
    label: string;
    help: string;
}
