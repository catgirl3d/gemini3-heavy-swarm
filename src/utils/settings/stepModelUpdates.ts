import { type AppSettings } from '@/types';
import { type UpdateResult } from '@/types/result-types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('StepModelUpdates');

/**
 * Mapping between AppSettings model keys and ProviderModels step names.
 */
export const STEP_KEY_TO_NAME = {
    initialModel: 'initial',
    refinementModel: 'refinement',
    synthesisModel: 'synthesis'
} as const;

/**
 * Updates a step model and syncs it with providerModels.
 * This is the centralized function for all step model changes.
 * 
 * @param settings Current settings
 * @param stepKey Which step model to update ('initialModel', 'refinementModel', 'synthesisModel')
 * @param model New model value (or undefined to clear)
 * @returns UpdateResult with updated settings and success status
 */
export function updateStepModel(
    settings: AppSettings,
    stepKey: 'initialModel' | 'refinementModel' | 'synthesisModel',
    model: string | undefined
): UpdateResult<AppSettings> {
    try {
        const provider = settings.provider;
        const providerModels = settings.providerModels || { stepModels: {}, roleModels: {} };
        const stepModels = { ...providerModels.stepModels };
        
        if (!stepModels[provider]) {
            stepModels[provider] = {};
        }
        
        // Map step key to step name using constant
        const stepName = STEP_KEY_TO_NAME[stepKey];
        
        stepModels[provider] = {
            ...stepModels[provider],
            [stepName]: model || undefined
        };
        
        if (!model) {
            logger.info(`Cleared model for step "${stepName}" (provider: ${provider})`);
        } else {
            logger.info(`Updated model for step "${stepName}" to "${model}" (provider: ${provider})`);
        }

        return {
            settings: {
                ...settings,
                [stepKey]: model || undefined,
                providerModels: {
                    ...providerModels,
                    stepModels
                }
            },
            success: true
        };
    } catch (error) {
        const errorMsg = `Failed to update step model "${stepKey}": ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg, error);
        return {
            settings,
            success: false,
            error: errorMsg
        };
    }
}
