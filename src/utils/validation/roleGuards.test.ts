import { describe, it, expect } from 'vitest';
import { assertRoleHasId, hasValidRoleId } from './roleGuards';
import { type AgentRole } from '@/types';

describe('roleGuards', () => {
  describe('hasValidRoleId', () => {
    it('should return true for role with valid ID', () => {
      const role: AgentRole = {
        id: 'valid-id-123',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(hasValidRoleId(role)).toBe(true);
    });

    it('should return false for role without ID', () => {
      const role = {
        name: 'Test Role',
        instruction: 'Test instruction'
      } as any;
      
      expect(hasValidRoleId(role)).toBe(false);
    });

    it('should return false for role with empty string ID', () => {
      const role: AgentRole = {
        id: '',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(hasValidRoleId(role)).toBe(false);
    });

    it('should return false for role with whitespace-only ID', () => {
      const role: AgentRole = {
        id: '   ',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(hasValidRoleId(role)).toBe(false);
    });

    it('should return true for role with UUID', () => {
      const role: AgentRole = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(hasValidRoleId(role)).toBe(true);
    });
  });

  describe('assertRoleHasId', () => {
    it('should not throw for role with valid ID', () => {
      const role: AgentRole = {
        id: 'valid-id-123',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(() => assertRoleHasId(role)).not.toThrow();
    });

    it('should throw for role without ID', () => {
      const role = {
        name: 'Test Role',
        instruction: 'Test instruction'
      } as any;
      
      expect(() => assertRoleHasId(role)).toThrow('Role is missing required ID');
      expect(() => assertRoleHasId(role)).toThrow('Test Role');
    });

    it('should throw for role with empty string ID', () => {
      const role: AgentRole = {
        id: '',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(() => assertRoleHasId(role)).toThrow('Role is missing required ID');
    });

    it('should throw for role with whitespace-only ID', () => {
      const role: AgentRole = {
        id: '   ',
        name: 'Empty Name',
        instruction: 'Test instruction'
      };
      
      expect(() => assertRoleHasId(role)).toThrow('Role is missing required ID');
      expect(() => assertRoleHasId(role)).toThrow('Empty Name');
    });

    it('should include context in error message when provided', () => {
      const role = {
        name: 'Test Role',
        instruction: 'Test instruction'
      } as any;
      
      expect(() => assertRoleHasId(role, 'profile=test, index=5')).toThrow('(profile=test, index=5)');
    });

    it('should include role name in error message', () => {
      const role = {
        name: 'Critical Role',
        instruction: 'Test instruction'
      } as any;
      
      expect(() => assertRoleHasId(role)).toThrow('Role name: "Critical Role"');
    });

    it('should work with UUID IDs', () => {
      const role: AgentRole = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      expect(() => assertRoleHasId(role)).not.toThrow();
    });

    it('should preserve type narrowing after assertion', () => {
      const role: AgentRole = {
        id: 'valid-id',
        name: 'Test Role',
        instruction: 'Test instruction'
      };
      
      assertRoleHasId(role);
      
      // TypeScript should know role.id is string (not undefined) after assertion
      const id: string = role.id;
      expect(id).toBe('valid-id');
    });
  });

  describe('Edge Cases', () => {
    it('should handle role with undefined name gracefully', () => {
      const role = {
        instruction: 'Test instruction'
      } as any;
      
      expect(() => assertRoleHasId(role)).toThrow();
      expect(hasValidRoleId(role)).toBe(false);
    });

    it('should handle role with all fields missing except ID', () => {
      const role: AgentRole = {
        id: 'only-id',
        name: '',
        instruction: ''
      };
      
      expect(() => assertRoleHasId(role)).not.toThrow();
      expect(hasValidRoleId(role)).toBe(true);
    });

    it('should handle role with model field', () => {
      const role: AgentRole = {
        id: 'role-with-model',
        name: 'Test Role',
        instruction: 'Test',
        model: 'gpt-4'
      };
      
      expect(() => assertRoleHasId(role)).not.toThrow();
      expect(hasValidRoleId(role)).toBe(true);
    });
  });
});
