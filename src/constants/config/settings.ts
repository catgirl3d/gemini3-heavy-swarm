import { AppSettings, ProviderType } from '@/types';
import { IS_FORCED_PROXY } from './env';
import { DEFAULT_ROLE_PROFILES } from '@/constants/roles';
import { DEFAULT_PROFILES } from '@/constants/prompts';
import { MAX_OUTPUT_TOKENS_LIMIT } from '@/constants/models';

// Determine default model based on environment (Proxy vs Direct)
// If proxy is forced, we default to flash-lite (demo mode)
const DEFAULT_MODEL = (process.env.GEMINI_API_KEY && !IS_FORCED_PROXY) ? 'gemini-3-pro-preview' : 'gemini-2.5-flash-lite';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: ProviderType.Gemini,
  numAgents: 2,
  apiKey: '',
  model: DEFAULT_MODEL,
  openRouterApiKey: '',
  openRouterModel: '',
  devMode: false,
  debugMode: false,
  simulateInitialError: 'none',
  simulateRefinementError: 'none',
  simulateSynthesisError: 'none',
  simulateInitialErrorAttempts: 1,
  simulateRefinementErrorAttempts: 1,
  simulateSynthesisErrorAttempts: 1,
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  useSearchInInitial: true,
  useSearchInRefinement: true,
  useSearchInSynthesis: true,
  activeProfileId: 'default',
  profiles: DEFAULT_PROFILES,
  temperature: 0.7,
  maxOutputTokens: MAX_OUTPUT_TOKENS_LIMIT,
  unsafeTemperature: false,
  dynamicAgentRoles: true,
  activeRoleProfileId: 'default-roles',
  roleProfiles: DEFAULT_ROLE_PROFILES,
  savedInstructions: [],
  savedRoles: [],
  initialModel: '',
  refinementModel: '',
  synthesisModel: ''
};
