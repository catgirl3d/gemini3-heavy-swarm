import { GenerationConfig } from '@google/genai';

/**
 * Generates the correct configuration depending on the model version.
 * Gemini 3.0 Pro requires thinking_level and default temperature.
 * Gemini 2.5 / 2.0 use thinking_budget.
 */
export const getGenerationConfig = (
  model: string,
  userTemperature: number | undefined,
  unsafeTemperature: boolean = false
): GenerationConfig => {
  const isGemini3 = model.includes('gemini-3');
  const isThinkingModel = model.toLowerCase().includes('thinking') || isGemini3;
  
  // Base config (maxOutputTokens is mandatory for all)
  const config: GenerationConfig = {
    maxOutputTokens: 65536,
  };

  if (isGemini3) {
    // --- SETTINGS FOR GEMINI 3.0 Pro ---
    
    // 1. Temperature: Google requires 1.0 (default) for 3.0 Pro.
    // If 0.7 is passed, the model might "get stuck" in its thoughts.
    // Therefore, we simply DO NOT pass temperature, so the default is used.
    // UNLESS unsafeTemperature is true (Advanced Mode).
    if (unsafeTemperature && userTemperature !== undefined) {
      config.temperature = userTemperature;
    }
    
    // 2. Thinking: use thinking_level instead of budget
    config.thinkingConfig = {
      includeThoughts: true, // To see thoughts (optional)
      thinkingLevel: "high"  // "low" for speed, "high" for quality
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