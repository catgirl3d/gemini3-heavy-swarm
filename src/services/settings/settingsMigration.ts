import { type AppSettings, type RoleProfile, type SavedInstruction, type SavedRole, type AgentRole, PROMPT_TYPES, type PromptTypeId, ProviderType, type RoleType } from '@/types';
import { DEFAULT_PROFILES, DEFAULT_ROLE_PROFILES, DEFAULT_SETTINGS, MAX_OUTPUT_TOKENS_LIMIT } from '@/constants';
import { generateUUID } from '@/utils/common/uuid';
import { Logger } from '@shared/utils/logger';
import { hasValidId } from '@/utils/validation/roleGuards';

const logger = new Logger('SettingsMigration');

/**
 * Represents settings from older versions of the application for migration purposes.
 */
export interface LegacyAppSettings extends Partial<AppSettings> {
  model?: string;
  initialInstruction?: string;
  refinementInstruction?: string;
  synthesizerInstruction?: string;
  agentRoles?: AgentRole[];
}

/**
 * Legacy instruction format from older versions of the application.
 * Used during migration to properly type-cast old data.
 */
export interface LegacySavedInstruction {
  id: string;
  name: string;
  type: 'initial' | 'refinement' | 'synthesizer'; // Old type names
  content: string;
}

/**
 * Maps legacy instruction type names to current format.
 */
function migrateLegacyInstructionType(
  legacyType: 'initial' | 'refinement' | 'synthesizer'
): PromptTypeId {
  const typeMap = {
    'initial': PROMPT_TYPES.INITIAL,
    'refinement': PROMPT_TYPES.REFINEMENT,
    'synthesizer': PROMPT_TYPES.SYNTHESIS
  };
  return typeMap[legacyType];
}

/**
 * Migrates a legacy or mixed-format settings object to the current AppSettings format.
 * This function is pure and does not mutate the input.
 * 
 * @param parsed - Parsed settings from localStorage (may be legacy or current format)
 * @returns Fully migrated AppSettings object
 */
export function migrateSettings(parsed: LegacyAppSettings): AppSettings {
  const migrated = { ...parsed } as LegacyAppSettings;
  let hasChanges = false;

  // Migration 1: Ensure profiles exist
  if (!migrated.profiles) {
    hasChanges = true;
    migrated.profiles = structuredClone(DEFAULT_PROFILES);
    migrated.activeProfileId = 'default';
    
    // Migrate old instructions to a custom profile if they differ from default
    if (
      migrated.initialInstruction !== DEFAULT_PROFILES[0].initialInstruction ||
      migrated.refinementInstruction !== DEFAULT_PROFILES[0].refinementInstruction ||
      migrated.synthesizerInstruction !== DEFAULT_PROFILES[0].synthesizerInstruction
    ) {
      const customProfile = {
        id: 'custom-migrated',
        name: 'Custom (Migrated)',
        initialInstruction: migrated.initialInstruction || DEFAULT_PROFILES[0].initialInstruction,
        refinementInstruction: migrated.refinementInstruction || DEFAULT_PROFILES[0].refinementInstruction,
        synthesizerInstruction: migrated.synthesizerInstruction || DEFAULT_PROFILES[0].synthesizerInstruction
      };
      migrated.profiles.push(customProfile);
      migrated.activeProfileId = 'custom-migrated';
    }
  }

  // Migration 2: Ensure roleProfiles exist
  if (!migrated.roleProfiles) {
    hasChanges = true;
    migrated.roleProfiles = structuredClone(DEFAULT_ROLE_PROFILES);
    migrated.activeRoleProfileId = 'default-roles';

    // Migrate old agentRoles to a custom profile if they exist
    if (migrated.agentRoles && migrated.agentRoles.length > 0) {
      const customRoleProfile = {
        id: 'custom-roles-migrated',
        name: 'Custom Roles (Migrated)',
        roles: migrated.agentRoles,
        criticRoles: [] // Explicitly initialize to avoid undefined
      };
      migrated.roleProfiles.push(customRoleProfile);
      migrated.activeRoleProfileId = 'custom-roles-migrated';
    }
    // Clean up old property
    delete migrated.agentRoles;
    logger.info('Cleaned up legacy agentRoles');
  } else {
    // Ensure new default profiles are available even if settings exist
    const madScientistProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === 'mad-scientists');
    if (madScientistProfile && !migrated.roleProfiles.some((p: RoleProfile) => p.id === 'mad-scientists')) {
      hasChanges = true;
      migrated.roleProfiles.push(structuredClone(madScientistProfile));
    }
  }

  // Migration 3: Ensure criticRoles exist in roleProfiles
  if (migrated.roleProfiles) {
    let rolesChanged = false;
    migrated.roleProfiles = migrated.roleProfiles.map((profile: RoleProfile) => {
      if (!profile.criticRoles) {
        rolesChanged = true;
        const defaultProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === profile.id);
        return {
          ...profile,
          criticRoles: defaultProfile?.criticRoles ? structuredClone(defaultProfile.criticRoles) : []
        };
      }
      return profile;
    });
    if (rolesChanged) hasChanges = true;
  }


  // Migration 4: Ensure savedInstructions exist
  if (!migrated.savedInstructions) {
    hasChanges = true;
    migrated.savedInstructions = [];
  } else {
    // Migration 4.1: Ensure savedInstructions have IDs
    let instructionsChanged = false;
    migrated.savedInstructions = migrated.savedInstructions.map((inst) => {
      const instruction = inst as Partial<SavedInstruction>;
      if (!hasValidId(instruction)) {
         instructionsChanged = true;
         return { ...instruction, id: generateUUID() } as SavedInstruction;
      }
      return inst;
    });
    if (instructionsChanged) hasChanges = true;
  }

  // Migration 5: Ensure savedRoles exist
  if (!migrated.savedRoles) {
    hasChanges = true;
    migrated.savedRoles = [];
  } else {
    // Migration 5.1: Ensure savedRoles have IDs
    let savedRolesChanged = false;
    migrated.savedRoles = migrated.savedRoles.map((role) => {
      const savedRole = role as Partial<SavedRole>;
      if (!hasValidId(savedRole)) {
        savedRolesChanged = true;
        return { ...savedRole, id: generateUUID() } as SavedRole;
      }
      return role;
    });
    if (savedRolesChanged) hasChanges = true;
  }

  // Migration 6: Ensure pauseAfterRefinement exists
  if (migrated.pauseAfterRefinement === undefined) {
    hasChanges = true;
    migrated.pauseAfterRefinement = false;
  }

  // Migration 7: Ensure dynamicAgentRoles exists (default to true)
  if (migrated.dynamicAgentRoles === undefined) {
    hasChanges = true;
    migrated.dynamicAgentRoles = true;
  }

  // Migration 8: Update identifiers to use _step and _prompt suffixes
  if (migrated.savedInstructions) {
    let legacyMigrated = false;
    migrated.savedInstructions = migrated.savedInstructions.map((inst) => {
      // Type guard: check if this is a legacy instruction
      const maybeLegacy = inst as LegacySavedInstruction | SavedInstruction;
      
      if (
        maybeLegacy.type === 'initial' ||
        maybeLegacy.type === 'refinement' ||
        maybeLegacy.type === 'synthesizer'
      ) {
        legacyMigrated = true;
        // It's a legacy instruction, migrate it
        const legacyInst = maybeLegacy as LegacySavedInstruction;
        return {
          ...legacyInst,
          type: migrateLegacyInstructionType(legacyInst.type)
        } as SavedInstruction;
      }
      
      // Already in new format
      return maybeLegacy as SavedInstruction;
    });
    if (legacyMigrated) hasChanges = true;
  }

  // Migration 9: Cap numAgents at 5
  if (migrated.numAgents && migrated.numAgents > 5) {
    hasChanges = true;
    migrated.numAgents = 5;
  }

  // Migration 10: Ensure error simulation attempts exist
  if (migrated.simulateInitialErrorAttempts === undefined) {
    hasChanges = true;
    migrated.simulateInitialErrorAttempts = 1;
  }
  if (migrated.simulateRefinementErrorAttempts === undefined) {
    hasChanges = true;
    migrated.simulateRefinementErrorAttempts = 1;
  }
  if (migrated.simulateSynthesisErrorAttempts === undefined) {
    hasChanges = true;
    migrated.simulateSynthesisErrorAttempts = 1;
  }

  // Migration 11: Ensure maxOutputTokens exists
  if (migrated.maxOutputTokens === undefined) {
    hasChanges = true;
    migrated.maxOutputTokens = MAX_OUTPUT_TOKENS_LIMIT;
  }

  // Migration 12: Ensure search tool flags exist
  if (migrated.useSearchInInitial === undefined) {
    hasChanges = true;
    migrated.useSearchInInitial = true;
  }
  if (migrated.useSearchInRefinement === undefined) {
    hasChanges = true;
    migrated.useSearchInRefinement = true;
  }
  if (migrated.useSearchInSynthesis === undefined) {
    hasChanges = true;
    migrated.useSearchInSynthesis = true;
  }

  // Migration 13: Ensure step-specific models exist
  if (migrated.initialModel === undefined) {
    hasChanges = true;
    migrated.initialModel = '';
  }
  if (migrated.refinementModel === undefined) {
    hasChanges = true;
    migrated.refinementModel = '';
  }
  if (migrated.synthesisModel === undefined) {
    hasChanges = true;
    migrated.synthesisModel = '';
  }

  // Migration 14: Ensure OpenRouter settings exist
  if (migrated.provider === undefined) {
    hasChanges = true;
    migrated.provider = ProviderType.Gemini;
  }
  if (migrated.geminiModel === undefined) {
    hasChanges = true;
    migrated.geminiModel = migrated.model ?? DEFAULT_SETTINGS.geminiModel;
  }
  if (migrated.model !== undefined) {
    hasChanges = true;
    delete migrated.model;
  }
  if (migrated.openRouterApiKey === undefined) {
    hasChanges = true;
    migrated.openRouterApiKey = '';
  }
  if (migrated.openRouterModel === undefined) {
    hasChanges = true;
    migrated.openRouterModel = '';
  }

  // Migration 15: Ensure role models exist and are valid
  if (migrated.roleProfiles) {
    let modelsUpdated = false;
    migrated.roleProfiles = migrated.roleProfiles.map((profile) => {
        const roles = (profile.roles || []).map((role) => {
            if (role.model === '') { modelsUpdated = true; }
            return {
                ...role,
                model: role.model || undefined // Clean up empty strings or add if missing
            };
        });
        const criticRoles = (profile.criticRoles || []).map((role) => {
            if (role.model === '') { modelsUpdated = true; }
            return {
                ...role,
                model: role.model || undefined
            };
        });
        return { ...profile, roles, criticRoles };
    });
    if (modelsUpdated) hasChanges = true;
  }

  // Migration 16: Migrate legacy settings to providerModels structure and ensure all roles have IDs
  // This logic was moved from providerPersistence.ts to simplify the loading process.
  const allRolesHaveIds = (migrated.roleProfiles as RoleProfile[])?.every(profile =>
    profile.roles?.every(hasValidId) &&
    profile.criticRoles?.every(hasValidId)
  );
  const currentProvider = migrated.provider || ProviderType.Gemini;
  const currentProviderStepModels = migrated.providerModels?.stepModels?.[currentProvider];
  const needsStepModelBackfill = !currentProviderStepModels ||
    currentProviderStepModels.initial === undefined ||
    currentProviderStepModels.refinement === undefined ||
    currentProviderStepModels.synthesis === undefined;
  const needsRoleModelBackfill = (migrated.roleProfiles as RoleProfile[] | undefined)?.some(profile => {
    const providerRoleModels = migrated.providerModels?.roleModels?.[profile.id]?.[currentProvider];
    const isMissingMappedModel = (role: AgentRole, typeKey: RoleType) => {
      if (!role.model || !hasValidId(role)) return false;
      return !providerRoleModels?.[typeKey]?.[role.id];
    };

    return (
      profile.roles?.some(role => isMissingMappedModel(role, 'roles')) ||
      profile.criticRoles?.some(role => isMissingMappedModel(role, 'criticRoles'))
    );
  });

  if (!migrated.providerModels || !allRolesHaveIds || needsStepModelBackfill || needsRoleModelBackfill) {
    // Create new structures to avoid mutation
    const stepModels = { ...(migrated.providerModels?.stepModels || {}) };
    const roleModels = { ...(migrated.providerModels?.roleModels || {}) };

    // Ensure current provider has every step model in the map without overwriting newer values.
    const providerStepModels = { ...(stepModels[currentProvider] || {}) };
    let stepModelsUpdated = false;
    if (providerStepModels.initial === undefined) {
      providerStepModels.initial = migrated.initialModel;
      stepModelsUpdated = true;
    }
    if (providerStepModels.refinement === undefined) {
      providerStepModels.refinement = migrated.refinementModel;
      stepModelsUpdated = true;
    }
    if (providerStepModels.synthesis === undefined) {
      providerStepModels.synthesis = migrated.synthesisModel;
      stepModelsUpdated = true;
    }

    if (stepModelsUpdated || !stepModels[currentProvider]) {
      hasChanges = true;
      stepModels[currentProvider] = providerStepModels;
    }

    // Migrate and ensure IDs for all roles
    let rolesModified = false;
    migrated.roleProfiles = (migrated.roleProfiles as RoleProfile[])?.map(profile => {
      // IMPORTANT: Role IDs are scoped to their parent profile.
      // It is ALLOWED and EXPECTED for different profiles to contain roles with the same ID
      // (e.g., "software-team-product-manager" can exist in multiple profiles).
      // This is safe because providerModels.roleModels uses composite keys:
      // profileId -> provider -> roles/criticRoles -> roleId
      // Therefore, seenIdsInList only tracks duplicates WITHIN the same role list, not across profiles.
      const processRoles = (roles: AgentRole[] | undefined, typeKey: RoleType) => {
        const seenIdsInList = new Set<string>();
        return (roles || []).map(role => {
          const oldId = role.id;
          let id = oldId;
          const idWasMissing = !id || !hasValidId({ id }) || seenIdsInList.has(id);
          
          if (idWasMissing) {
            id = generateUUID();
            rolesModified = true;
            if (oldId) {
              logger.info(`Regenerating role ID for "${role.name}": ${oldId} -> ${id}`);
            } else {
              logger.info(`Generated new ID for role "${role.name}" in profile "${profile.name}": ${id}`);
            }
          }
          
          seenIdsInList.add(id);

          // Migration logic: move role.model to providerModels
          // If role has a model, we should migrate it if it's not already in providerModels
          if (role.model) {
            roleModels[profile.id] = { ...(roleModels[profile.id] || {}) };
            roleModels[profile.id][currentProvider] = {
              ...(roleModels[profile.id][currentProvider] || {})
            };
            
            const currentTypeModels = {
              ...(roleModels[profile.id][currentProvider][typeKey] || {})
            };

            // Only overwrite if not already present (preserve newer settings if re-migrating)
            if (!currentTypeModels[id]) {
                hasChanges = true; 
                currentTypeModels[id] = role.model;
                
                roleModels[profile.id][currentProvider] = {
                  ...roleModels[profile.id][currentProvider],
                  [typeKey]: currentTypeModels
                };
            }
          }
          
          return { ...role, id };
        });
      };

      return {
        ...profile,
        roles: processRoles(profile.roles, 'roles'),
        criticRoles: processRoles(profile.criticRoles, 'criticRoles')
      };
    });

    if (rolesModified) hasChanges = true;

    migrated.providerModels = {
      stepModels,
      roleModels
    };
  }

  if (hasChanges) {
    logger.info('Settings migration applied updates to ensure data integrity.');
  }
  
  return migrated as AppSettings;
}
