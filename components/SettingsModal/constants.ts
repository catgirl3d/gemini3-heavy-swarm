import { InstructionType, ProfileMetadata } from './types';

export const INSTRUCTION_METADATA: Record<InstructionType, ProfileMetadata> = {
    initial: {
        id: 'initial',
        label: 'Initial Agent Instruction',
        help: 'Instructions for the agents drafting the first response.'
    },
    refinement: {
        id: 'refinement',
        label: 'Refinement Instruction',
        help: 'Instructions for agents critiquing the initial drafts.'
    },
    synthesizer: {
        id: 'synthesizer',
        label: 'Synthesizer Instruction',
        help: 'Instructions for the final agent merging all refined responses.'
    }
};

export const AVAILABLE_MODELS = [
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' }
];
