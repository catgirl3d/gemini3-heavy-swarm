import { AppSettings } from '@/types';
import { IS_FORCED_PROXY } from './env';
import { DEFAULT_ROLE_PROFILES } from './roles';
import { DEFAULT_PROFILES } from './prompts';

// Determine default model based on environment (Proxy vs Direct)
// If proxy is forced, we default to flash-lite (demo mode)
const DEFAULT_MODEL = (process.env.GEMINI_API_KEY && !IS_FORCED_PROXY) ? 'gemini-3-pro-preview' : 'gemini-2.5-flash-lite';

export const DEFAULT_SETTINGS: AppSettings = {
  numAgents: 4,
  apiKey: '',
  model: DEFAULT_MODEL,
  devMode: false,
  debugMode: false,
  simulateSynthesisError: 'none',
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  activeProfileId: 'default',
  profiles: DEFAULT_PROFILES,
  temperature: 0.7,
  unsafeTemperature: false,
  dynamicAgentRoles: true,
  activeRoleProfileId: 'default-roles',
  roleProfiles: DEFAULT_ROLE_PROFILES,
  savedInstructions: [],
  savedRoles: []
};
