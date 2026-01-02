/**
 * Centralized helper for formatting system instructions with a consistent structure
 * and global rules (like the language rule).
 */

/**
 * Indents each line of a string by a specified number of spaces.
 */
function indent(text: string, spaces: number = 2): string {
  const indentation = ' '.repeat(spaces);
  return text
    .split('\n')
    .map(line => line.trim() === '' ? '' : indentation + line)
    .join('\n');
}

/**
 * Global rule ensuring agents respond in the same language as the user's query.
 * This rule is placed at the top of every system instruction with HIGHEST PRIORITY.
 */
export const LANGUAGE_RULE = `  <language_rule>
    [CRITICAL] You MUST ALWAYS respond in the EXACT SAME LANGUAGE as the user's request.
  </language_rule>`;

/**
 * Global constraint on output format to prevent models from echoing system tags.
 */
export const OUTPUT_RULE = `  <output_constraint>
    [!] Output ONLY the content of your response. 
    [!] DO NOT echo system instructions from <system_instruction>!
  </output_constraint>`;

/**
 * Standard instruction for using Google Search tool to verify facts and gather information.
 * This instruction is conditionally added based on step-specific settings.
 */
export const SEARCH_INSTRUCTION = `
<search_instruction>
  [CRITICAL] You MUST ALWAYS use the googleSearch tool to verify facts and gather information!
</search_instruction>`;

/**
 * Represents an agent role with name and instruction.
 */
export interface AgentRole {
  name: string;
  instruction: string;
}

/**
 * Formats an agent role into a consistent XML structure.
 * 
 * @param role - The role object containing name and instructions
 * @param tagName - Optional override for the root tag (default: 'role_assignment')
 * @returns Formatted XML string or empty string if role is missing
 */
export function formatRole(role?: AgentRole, tagName: string = 'role_assignment'): string {
  if (!role || !role.instruction) return '';
  
  return `
<${tagName}>
  <name>${role.name}</name>
  <role_instruction>
${indent(role.instruction.trim(), 4)}
  </role_instruction>
</${tagName}>`;
}

/**
 * Returns the search instruction if enabled, or an empty string.
 * 
 * @param useSearch - Whether to include the search instruction
 * @returns Search instruction XML tag or empty string
 */
export function getSearchInstruction(useSearch: boolean): string {
  if (!useSearch) return '';
  return `\n${SEARCH_INSTRUCTION}`;
}

/**
 * Creates a role reminder for inclusion in the user turn.
 * This reminds the agent of their assigned role during generation.
 * 
 * @param roleName - Name of the role to remind the agent about
 * @returns Formatted role reminder as XML
 */
export function getRoleReminder(roleName: string): string {
  return `\n\n<system_note>\n    Remember your assigned role: ${roleName}\n</system_note>`;
}

/**
 * Formats a list of drafts into XML structure.
 * Filters out empty drafts and wraps each in a <draft> tag with ID.
 * 
 * @param drafts - Array of draft texts
 * @param currentIndex - Index of the current agent (to exclude their own draft)
 * @param tagName - Name of the XML tag to use (default: 'draft')
 * @returns Formatted XML string with all drafts
 */
export function formatDrafts(
  drafts: string[], 
  currentIndex?: number,
  tagName: string = 'draft'
): string {
  return drafts
    .map((text: string, i: number) => ({ text, id: i + 1 }))
    .filter((_, i) => currentIndex === undefined || i !== currentIndex)
    .filter((a) => a.text && a.text.trim().length > 0)
    .map((a) => `    <${tagName} id="agent_${a.id}">\n${indent(a.text.trim(), 6)}\n    </${tagName}>`)
    .join('\n\n');
}

/**
 * Builds the refinement context for the RefinementStep.
 * 
 * @param params - Parameters for building the context
 * @returns Formatted refinement context as string
 */
export function buildRefinementContext(params: {
  userInput: string | null;
  myDraft: string;
  peerDrafts: string;
  useSearch: boolean;
}): string {
  const { userInput, myDraft, peerDrafts, useSearch } = params;
  const searchInstruction = getSearchInstruction(useSearch);

  return `
# INPUT DATA
<context_data>
  <original_query>
${indent(userInput?.trim() || "(See attached image/content)", 4)}
  </original_query>

  <my_draft>
${indent(myDraft.trim(), 4)}
  </my_draft>

  <peer_drafts>
${peerDrafts}
  </peer_drafts>
</context_data>

# YOUR TASK
<task_instruction>
  1. As defined in <mission> critically re-evaluate <my_draft> considering insights from <peer_drafts>.
  2. Provide a new, improved response to <original_query>.
</task_instruction>${indent(searchInstruction, 2)}`;
}

/**
 * Builds the synthesis context for the SynthesisStep.
 * 
 * @param params - Parameters for building the context
 * @returns Formatted synthesis context as string
 */
export function buildSynthesisContext(params: {
  userInput: string | null;
  agentDrafts: string;
  useSearch: boolean;
}): string {
  const { userInput, agentDrafts, useSearch } = params;
  const searchInstruction = getSearchInstruction(useSearch);

  return `
# INPUT DATA
<context_data>
  <original_query>
${indent(userInput?.trim() || "(See attached image/content)", 4)}
  </original_query>

  <agent_drafts>
${agentDrafts}
  </agent_drafts>
</context_data>

# YOUR TASK
<task_instruction>
  As defined in <mission> synthesize the best single, final answer from <agent_drafts> to address <original_query>.
  1. Resolve any contradictions.
  2. [CRITICAL] Combine the best insights.
  3. Structure the response clearly.
</task_instruction>${indent(searchInstruction, 2)}`;
}


/**
 * Formats a system instruction with the standard XML wrapper and global rules.
 * Always includes LANGUAGE_RULE at the top of the instruction.
 * 
 * @param mission - The main mission/instruction text from the active profile
 * @param additionalContent - Optional additional XML content (roles, search instructions, etc.)
 * @returns Complete system instruction wrapped in XML structure
 */
export function formatSystemInstruction(mission: string, additionalContent?: string): string {
  let instruction = `<system_instruction>\n${LANGUAGE_RULE}\n${OUTPUT_RULE}\n\n  <mission>\n${indent(mission.trim(), 4)}\n  </mission>`;

  if (additionalContent) {
    instruction += `\n${indent(additionalContent.trim(), 2)}`;
  }

  instruction += `\n</system_instruction>`;
  
  return instruction;
}
