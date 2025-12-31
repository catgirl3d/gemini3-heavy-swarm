import { InstructionType, ProfileMetadata } from '@/components/modals/SettingsModal/types';
import { AVAILABLE_MODELS as SHARED_MODELS } from '@shared/security/security';
import { PROMPT_TYPES } from '@/types';

export const INSTRUCTION_METADATA: Record<InstructionType, ProfileMetadata> = {
    [PROMPT_TYPES.INITIAL]: {
        id: PROMPT_TYPES.INITIAL,
        label: 'Initial Agent Instruction',
        help: 'Instructions for the agents drafting the first response.',
        modelKey: 'initialModel'
    },
    [PROMPT_TYPES.REFINEMENT]: {
        id: PROMPT_TYPES.REFINEMENT,
        label: 'Refinement Instruction',
        help: 'Instructions for agents critiquing the initial drafts.',
        modelKey: 'refinementModel'
    },
    [PROMPT_TYPES.SYNTHESIS]: {
        id: PROMPT_TYPES.SYNTHESIS,
        label: 'Synthesizer Instruction',
        help: 'Instructions for the final agent merging all refined responses.',
        modelKey: 'synthesisModel'
    }
};

export const AVAILABLE_MODELS = SHARED_MODELS;
