export const getModelDisplayName = (model: string): string => {
  const modelNames: Record<string, string> = {
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite Swarm',
    'gemini-2.5-flash': 'Gemini 2.5 Flash Swarm',
    'gemini-2.5-pro': 'Gemini 2.5 Pro Swarm',
    'gemini-3-flash-preview': 'Gemini 3 Flash Swarm',
    'gemini-3-pro-preview': 'Gemini 3 Pro Swarm',
  };
  if (modelNames[model]) return modelNames[model];
  
  // If it's a path-like model (e.g. provider/model), it's likely OpenRouter
  if (model.includes('/')) return model;

  return model || 'Default Model';
};

export const formatModelTag = (model: string): string => {
  if (!model) return 'Default';
  if (model.includes('/')) {
    return model.split('/').pop() || model;
  }
  return model;
};
