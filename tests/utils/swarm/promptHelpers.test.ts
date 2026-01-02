import { describe, it, expect } from 'vitest';
import { 
  LANGUAGE_RULE, 
  OUTPUT_RULE,
  SEARCH_INSTRUCTION, 
  getSearchInstruction, 
  getRoleReminder, 
  formatSystemInstruction,
  formatRole,
  formatDrafts,
  buildRefinementContext,
  buildSynthesisContext
} from '@/utils/swarm/promptHelpers';

describe('promptHelpers', () => {
  describe('LANGUAGE_RULE', () => {
    it('should be a non-empty string', () => {
      expect(LANGUAGE_RULE).toBeTruthy();
      expect(typeof LANGUAGE_RULE).toBe('string');
      expect(LANGUAGE_RULE.length).toBeGreaterThan(0);
    });

    it('should contain correct XML tags', () => {
      expect(LANGUAGE_RULE).toContain('<language_rule>');
      expect(LANGUAGE_RULE).toContain('</language_rule>');
    });

    it('should contain CRITICAL marker', () => {
      expect(LANGUAGE_RULE).toContain('[CRITICAL]');
    });
  });

  describe('OUTPUT_RULE', () => {
    it('should be a non-empty string', () => {
      expect(OUTPUT_RULE).toBeTruthy();
      expect(typeof OUTPUT_RULE).toBe('string');
      expect(OUTPUT_RULE.length).toBeGreaterThan(0);
    });

    it('should contain correct XML tags', () => {
      expect(OUTPUT_RULE).toContain('<output_constraint>');
      expect(OUTPUT_RULE).toContain('</output_constraint>');
    });

    it('should contain [!] marker', () => {
      expect(OUTPUT_RULE).toContain('[!]');
    });

    it('should forbid echoing system instructions', () => {
      expect(OUTPUT_RULE).toContain('Output ONLY the content');
      expect(OUTPUT_RULE).toContain('DO NOT echo system instructions');
    });
  });

  describe('SEARCH_INSTRUCTION', () => {
    it('should be a non-empty string', () => {
      expect(SEARCH_INSTRUCTION).toBeTruthy();
      expect(typeof SEARCH_INSTRUCTION).toBe('string');
      expect(SEARCH_INSTRUCTION.length).toBeGreaterThan(0);
    });

    it('should contain correct XML tags', () => {
      expect(SEARCH_INSTRUCTION).toContain('<search_instruction>');
      expect(SEARCH_INSTRUCTION).toContain('</search_instruction>');
    });

    it('should contain CRITICAL marker', () => {
      expect(SEARCH_INSTRUCTION).toContain('[CRITICAL]');
    });

    it('should mention googleSearch tool', () => {
      expect(SEARCH_INSTRUCTION).toContain('googleSearch');
    });
  });

  describe('getSearchInstruction', () => {
    it('should return search instruction when enabled', () => {
      const result = getSearchInstruction(true);
      expect(result).toContain(SEARCH_INSTRUCTION);
      expect(result).toContain('<search_instruction>');
    });

    it('should return empty string when disabled', () => {
      const result = getSearchInstruction(false);
      expect(result).toBe('');
    });

    it('should prepend newline when enabled', () => {
      const result = getSearchInstruction(true);
      expect(result.startsWith('\n')).toBe(true);
    });
  });

  describe('getRoleReminder', () => {
    it('should create reminder with given role name', () => {
      const roleName = 'Visionary';
      const result = getRoleReminder(roleName);
      
      expect(result).toContain(roleName);
      expect(result).toContain('Remember your assigned role');
    });

    it('should contain correct XML tags', () => {
      const result = getRoleReminder('Analyst');
      
      expect(result).toContain('<system_note>');
      expect(result).toContain('</system_note>');
    });

    it('should start with double newline', () => {
      const result = getRoleReminder('TestRole');
      expect(result.startsWith('\n\n')).toBe(true);
    });

    it('should handle special characters in role name', () => {
      const roleName = 'Data Scientist & ML Expert';
      const result = getRoleReminder(roleName);
      
      expect(result).toContain(roleName);
    });
  });

  describe('formatRole', () => {
    it('should return empty string if role is missing', () => {
      expect(formatRole()).toBe('');
      expect(formatRole(undefined)).toBe('');
    });

    it('should return empty string if role instruction is missing', () => {
      expect(formatRole({ name: 'Test', instruction: '' })).toBe('');
    });

    it('should format role correctly with name and instruction', () => {
      const role = { name: 'Critic', instruction: 'Evaluate carefully' };
      const result = formatRole(role);
      
      expect(result).toContain('<role_assignment>');
      expect(result).toContain('<name>Critic</name>');
      expect(result).toContain('<role_instruction>');
      expect(result).toContain('Evaluate carefully');
      expect(result).toContain('</role_instruction>');
      expect(result).toContain('</role_assignment>');
    });

    it('should support custom tag name', () => {
      const role = { name: 'Expert', instruction: 'Share knowledge' };
      const result = formatRole(role, 'expert_role');
      
      expect(result).toContain('<expert_role>');
      expect(result).toContain('</expert_role>');
    });
  });

  describe('formatDrafts', () => {
    it('should format multiple drafts correctly', () => {
      const drafts = ['draft 1', 'draft 2'];
      const result = formatDrafts(drafts);
      
      expect(result).toContain('<draft id="agent_1">');
      expect(result).toContain('draft 1');
      expect(result).toContain('<draft id="agent_2">');
      expect(result).toContain('draft 2');
    });

    it('should filter out current agent draft', () => {
      const drafts = ['draft 1', 'draft 2', 'draft 3'];
      const result = formatDrafts(drafts, 1); // exclude index 1 (agent 2)
      
      expect(result).toContain('agent_1');
      expect(result).not.toContain('agent_2');
      expect(result).toContain('agent_3');
    });

    it('should filter out empty drafts', () => {
      const drafts = ['draft 1', '', '  ', 'draft 4'];
      const result = formatDrafts(drafts);
      
      expect(result).toContain('agent_1');
      expect(result).not.toContain('agent_2');
      expect(result).not.toContain('agent_3');
      expect(result).toContain('agent_4');
    });

    it('should use custom tag name', () => {
      const drafts = ['content'];
      const result = formatDrafts(drafts, undefined, 'version');
      
      expect(result).toContain('<version id="agent_1">');
      expect(result).toContain('</version>');
    });
  });

  describe('buildRefinementContext', () => {
    it('should build complete refinement context', () => {
      const params = {
        userInput: 'test query',
        myDraft: 'my initial response',
        peerDrafts: '<draft id="agent_2">peer response</draft>',
        useSearch: true
      };
      
      const result = buildRefinementContext(params);
      
      expect(result).toContain('# INPUT DATA');
      expect(result).toContain('<original_query>');
      expect(result).toContain('test query');
      expect(result).toContain('</original_query>');
      expect(result).toContain('<my_draft>');
      expect(result).toContain('my initial response');
      expect(result).toContain('</my_draft>');
      expect(result).toContain('<peer_drafts>');
      expect(result).toContain('agent_2');
      expect(result).toContain('</peer_drafts>');
      expect(result).toContain('# YOUR TASK');
      expect(result).toContain('<task_instruction>');
      expect(result).toContain('</task_instruction>');
    });

    it('should handle missing userInput', () => {
      const result = buildRefinementContext({
        userInput: null,
        myDraft: 'draft',
        peerDrafts: '',
        useSearch: false
      });
      
      expect(result).toContain('(See attached image/content)');
    });
  });

  describe('buildSynthesisContext', () => {
    it('should build complete synthesis context', () => {
      const params = {
        userInput: 'main task',
        agentDrafts: '<draft id="agent_1">final 1</draft>',
        useSearch: true
      };
      
      const result = buildSynthesisContext(params);
      
      expect(result).toContain('# INPUT DATA');
      expect(result).toContain('<original_query>');
      expect(result).toContain('main task');
      expect(result).toContain('</original_query>');
      expect(result).toContain('<agent_drafts>');
      expect(result).toContain('agent_1');
      expect(result).toContain('final 1');
      expect(result).toContain('</agent_drafts>');
      expect(result).toContain('# YOUR TASK');
      expect(result).toContain('<task_instruction>');
      expect(result).toContain('</task_instruction>');
    });
  });

  describe('formatSystemInstruction', () => {
    const testMission = 'You are a helpful assistant';

    it('should create valid XML structure', () => {
      const result = formatSystemInstruction(testMission);
      
      expect(result).toContain('<system_instruction>');
      expect(result).toContain('</system_instruction>');
    });

    it('should always include LANGUAGE_RULE', () => {
      const result = formatSystemInstruction(testMission);
      
      expect(result).toContain('<language_rule>');
    });

    it('should always include OUTPUT_RULE', () => {
      const result = formatSystemInstruction(testMission);
      
      expect(result).toContain('<output_constraint>');
      expect(result).toContain('Output ONLY the content');
    });

    it('should include mission in correct tag', () => {
      const result = formatSystemInstruction(testMission);
      
      expect(result).toContain('<mission>');
      expect(result).toContain(testMission);
      expect(result).toContain('</mission>');
    });

    it('should place LANGUAGE_RULE before mission', () => {
      const result = formatSystemInstruction(testMission);
      
      const languageRuleIndex = result.indexOf('<language_rule>');
      const missionIndex = result.indexOf('<mission>');
      
      expect(languageRuleIndex).toBeGreaterThan(-1);
      expect(missionIndex).toBeGreaterThan(-1);
      expect(languageRuleIndex).toBeLessThan(missionIndex);
    });

    it('should include additional content when provided', () => {
      const roleContent = formatRole({ name: 'Analyst', instruction: 'Analyze data' });
      const result = formatSystemInstruction(testMission, roleContent);
      
      expect(result).toContain('<role_assignment>');
      expect(result).toContain('<role_instruction>');
      expect(result).toContain('Analyst');
    });

    it('should place additional content after mission', () => {
      const roleContent = formatRole({ name: 'Expert', instruction: 'Provide expertise' });
      const result = formatSystemInstruction(testMission, roleContent);
      
      const missionIndex = result.indexOf('</mission>');
      const roleIndex = result.indexOf('<role_assignment>');
      
      expect(missionIndex).toBeLessThan(roleIndex);
    });

    it('should work without additional content', () => {
      const result = formatSystemInstruction(testMission);
      
      expect(result).toBeTruthy();
      expect(result).toContain(testMission);
    });

    it('should properly close system_instruction tag', () => {
      const result = formatSystemInstruction(testMission);
      
      expect(result.trim().endsWith('</system_instruction>')).toBe(true);
    });

    it('should handle multiline mission text', () => {
      const multilineMission = `Line 1
Line 2
Line 3`;
      const result = formatSystemInstruction(multilineMission);
      
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
      expect(result).toContain('<mission>');
      expect(result).toContain('</mission>');
    });

    it('should create complete instruction with all parts', () => {
      const mission = 'Test mission';
      const roleContent = formatRole({ name: 'TestRole', instruction: 'Do test' });
      const search = getSearchInstruction(true);
      
      const result = formatSystemInstruction(mission, roleContent + search);
      
      expect(result).toContain(mission);
      expect(result).toContain('<role_assignment>');
      expect(result).toContain('<role_instruction>');
      expect(result).toContain('TestRole');
      expect(result).toContain('<search_instruction>');
      expect(result.startsWith('<system_instruction>')).toBe(true);
    });
  });

  describe('Integration: Combined usage', () => {
    it('should create valid system instruction with all components', () => {
      const mission = 'You are a critical thinker';
      const roleName = 'Critic';
      const useSearch = true;
      
      const roleContent = formatRole({ name: roleName, instruction: 'Critique work' });
      const searchContent = getSearchInstruction(useSearch);
      
      const systemInstruction = formatSystemInstruction(
        mission,
        roleContent + searchContent
      );
      
      // Verify structure
      expect(systemInstruction).toContain('<system_instruction>');
      expect(systemInstruction).toContain('</system_instruction>');
      
      // Verify LANGUAGE_RULE is present and comes first
      const languageIndex = systemInstruction.indexOf('<language_rule>');
      const missionIndex = systemInstruction.indexOf('<mission>');
      expect(languageIndex).toBeLessThan(missionIndex);
      
      // Verify mission
      expect(systemInstruction).toContain('<mission>');
      expect(systemInstruction).toContain(mission);
      expect(systemInstruction).toContain('</mission>');
      
      // Verify role
      expect(systemInstruction).toContain('<role_assignment>');
      expect(systemInstruction).toContain('<role_instruction>');
      expect(systemInstruction).toContain(roleName);
      
      // Verify search instruction
      expect(systemInstruction).toContain('<search_instruction>');
      
      // Verify task instruction is NOT here (it's for user turn context, but we check combined system instr)
      // Actually we check if it contains task_instruction if we were testing buildRefinementContext
    });


    it('should work with minimal configuration', () => {
      const mission = 'Simple mission';
      const systemInstruction = formatSystemInstruction(mission);
      
      expect(mission).toBeTruthy();
      expect(systemInstruction).toContain(mission);
      expect(systemInstruction).toContain('<system_instruction>');
      expect(systemInstruction).toContain('</system_instruction>');
    });
  });
});
