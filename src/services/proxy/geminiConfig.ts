import { GenerationConfig, ThinkingLevel } from '@google/genai';
import { Logger } from '@shared/utils/logger';
import { isThinkingModel as checkIsThinkingModel } from '@/utils/common/modelUtils';
import { ProviderType } from '@/types';
import { MIN_OUTPUT_TOKENS_FOR_THINKING, MAX_OUTPUT_TOKENS_LIMIT } from '@/constants';

const logger = new Logger('geminiConfig');

/**
 * Generates the correct configuration depending on the model version.
 * Gemini 3.0 Pro requires thinking_level and default temperature.
 * Gemini 2.5 / 2.0 use thinking_budget.
 * 
 * CRITICAL: Thinking models require a minimum output token budget (4000+) to ensure
 * they have space for actual text output after the reasoning phase completes.
 */
export const getGenerationConfig = (
  model: string,
  userTemperature: number | undefined,
  userMaxOutputTokens: number = MAX_OUTPUT_TOKENS_LIMIT,
  unsafeTemperature: boolean = false
): GenerationConfig => {
  const isGemini3 = model.includes('gemini-3');
  const isThinkingModel = checkIsThinkingModel(ProviderType.Gemini, model);

  // CRITICAL: Enforce minimum tokens for thinking models
  // Without sufficient output tokens, thinking models may consume all tokens in reasoning
  // and return no actual text (only thoughts), causing empty responses.
  let effectiveMaxTokens = userMaxOutputTokens;
  if (isThinkingModel && userMaxOutputTokens < MIN_OUTPUT_TOKENS_FOR_THINKING) {
    logger.warn(
      `Thinking model "${model}" requires minimum ${MIN_OUTPUT_TOKENS_FOR_THINKING} output tokens. ` +
      `User setting (${userMaxOutputTokens}) is too low, enforcing minimum.`
    );
    effectiveMaxTokens = MIN_OUTPUT_TOKENS_FOR_THINKING;
  }

  // Base config
  const config: GenerationConfig = {
    maxOutputTokens: effectiveMaxTokens,
  };

  if (isGemini3) {
    // --- SETTINGS FOR GEMINI 3.0 Pro / Flash ---

    // 1. Temperature: Google requires 1.0 (default) for 3.0 Pro/Flash.
    // If 0.7 is passed, the model might "get stuck" in its thoughts.
    // Therefore, we simply DO NOT pass temperature, so the default is used.
    // UNLESS unsafeTemperature is true (Advanced Mode).
    if (unsafeTemperature && userTemperature !== undefined) {
      config.temperature = userTemperature;
    }

    // 2. Thinking: use thinking_level instead of budget
    config.thinkingConfig = {
      includeThoughts: true, // To see thoughts (optional)
      thinkingLevel: "high" as ThinkingLevel  // "low" for speed, "high" for quality
    };

  } else if (isThinkingModel) {
    // --- SETTINGS FOR GEMINI 2.0 / 2.5 PRO/FLASH THINKING ---

    // 1. Temperature: can be adjusted here, but carefully (0.7 is ok)
    config.temperature = userTemperature ?? 0.7;

    // 2. Thinking: use old thinking_budget
    config.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: 16000 // 16k tokens is optimal
    };

  } else {
    config.temperature = userTemperature ?? 0.7;
    // DO NOT add thinkingConfig, otherwise there will be a 400 error
  }

  return config;
};