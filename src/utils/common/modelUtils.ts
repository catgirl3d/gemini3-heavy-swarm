export const getModelDisplayName = (model: string): string => {
  const modelNames: Record<string, string> = {
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite Swarm',
    'gemini-2.5-flash': 'Gemini 2.5 Flash Swarm',
    'gemini-2.5-pro': 'Gemini 2.5 Pro Swarm',
    'gemini-3-flash-preview': 'Gemini 3 Flash Swarm',
    'gemini-3-pro-preview': 'Gemini 3 Pro Swarm',
  };
  return modelNames[model] || 'Gemini Swarm';
};
