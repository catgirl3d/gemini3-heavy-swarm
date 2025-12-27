import { AppSettings, RoleProfile, SavedInstruction, LegacySavedInstruction, AgentRole } from '@/types';
import { DEFAULT_PROFILES, DEFAULT_ROLE_PROFILES } from '@/constants';

/**
 * Represents settings from older versions of the application for migration purposes.
 */
export interface LegacyAppSettings extends Partial<AppSettings> {
  initialInstruction?: string;
  refinementInstruction?: string;
  synthesizerInstruction?: string;
  agentRoles?: AgentRole[];
}

/**
 * Maps legacy instruction type names to current format.
 */
function migrateLegacyInstructionType(
  legacyType: 'initial' | 'refinement' | 'synthesizer'
): 'initial_prompt' | 'refinement_prompt' | 'synthesis_prompt' {
  const typeMap = {
    'initial': 'initial_prompt' as const,
    'refinement': 'refinement_prompt' as const,
    'synthesizer': 'synthesis_prompt' as const
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

  // Migration 1: Ensure profiles exist
  if (!migrated.profiles) {
    migrated.profiles = DEFAULT_PROFILES;
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
    migrated.roleProfiles = DEFAULT_ROLE_PROFILES;
    migrated.activeRoleProfileId = 'default-roles';

    // Migrate old agentRoles to a custom profile if they exist
    if (migrated.agentRoles && migrated.agentRoles.length > 0) {
      const customRoleProfile = {
        id: 'custom-roles-migrated',
        name: 'Custom Roles (Migrated)',
        roles: migrated.agentRoles
      };
      migrated.roleProfiles.push(customRoleProfile);
      migrated.activeRoleProfileId = 'custom-roles-migrated';
    }
    // Clean up old property
    delete migrated.agentRoles;
  } else {
    // Ensure new default profiles are available even if settings exist
    const madScientistProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === 'mad-scientists');
    if (madScientistProfile && !migrated.roleProfiles.some((p: RoleProfile) => p.id === 'mad-scientists')) {
      migrated.roleProfiles.push(madScientistProfile);
    }
  }

  // Migration 3: Ensure criticRoles exist in roleProfiles
  if (migrated.roleProfiles) {
    migrated.roleProfiles = migrated.roleProfiles.map((profile: RoleProfile) => {
      if (!profile.criticRoles) {
        const defaultProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === profile.id);
        return {
          ...profile,
          criticRoles: defaultProfile?.criticRoles || []
        };
      }
      return profile;
    });
  }

  // Migration 4: Ensure savedInstructions exist
  if (!migrated.savedInstructions) {
    migrated.savedInstructions = [];
  }

  // Migration 5: Ensure savedRoles exist
  if (!migrated.savedRoles) {
    migrated.savedRoles = [];
  }

  // Migration 6: Ensure pauseAfterRefinement exists
  if (migrated.pauseAfterRefinement === undefined) {
    migrated.pauseAfterRefinement = false;
  }

  // Migration 7: Ensure dynamicAgentRoles exists (default to true)
  if (migrated.dynamicAgentRoles === undefined) {
    migrated.dynamicAgentRoles = true;
  }

  // Migration 8: Update identifiers to use _step and _prompt suffixes
  if (migrated.savedInstructions) {
    migrated.savedInstructions = migrated.savedInstructions.map((inst) => {
      // Type guard: check if this is a legacy instruction
      const maybeLegacy = inst as LegacySavedInstruction | SavedInstruction;
      
      if (
        maybeLegacy.type === 'initial' ||
        maybeLegacy.type === 'refinement' ||
        maybeLegacy.type === 'synthesizer'
      ) {
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
  }

  // Migration 9: Cap numAgents at 5
  if (migrated.numAgents && migrated.numAgents > 5) {
    migrated.numAgents = 5;
  }

  return migrated as AppSettings;
}
