import { InstructionType, ProfileMetadata } from './types';
import { AVAILABLE_MODELS as SHARED_MODELS } from '../../constants/security.js';

export const INSTRUCTION_METADATA: Record<InstructionType, ProfileMetadata> = {
    initial_prompt: {
        id: 'initial_prompt',
        label: 'Initial Agent Instruction',
        help: 'Instructions for the agents drafting the first response.'
    },
    refinement_prompt: {
        id: 'refinement_prompt',
        label: 'Refinement Instruction',
        help: 'Instructions for agents critiquing the initial drafts.'
    },
    synthesis_prompt: {
        id: 'synthesis_prompt',
        label: 'Synthesizer Instruction',
        help: 'Instructions for the final agent merging all refined responses.'
    }
};

export const AVAILABLE_MODELS = SHARED_MODELS;
