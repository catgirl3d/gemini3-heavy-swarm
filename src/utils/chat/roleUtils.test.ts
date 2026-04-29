import { describe, it, expect } from 'vitest';
import { getAgentRole } from '@/utils/chat/roleUtils';
import { AppSettings } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';

describe('roleUtils', () => {
  describe('getAgentRole', () => {
    it('should return role by index when roles exist', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Engineer', instruction: 'Code' },
            { id: 'role-2', name: 'Designer', instruction: 'Design' }
          ],
          criticRoles: []
        }]
      });

      const role = getAgentRole(0, settings, 'roles');
      
      expect(role.id).toBe('role-1');
      expect(role.name).toBe('Engineer');
      expect(role.instruction).toBe('Code');
    });

    it('should return fallback role when index exceeds role count', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Engineer', instruction: 'Code' },
            { id: 'role-2', name: 'Designer', instruction: 'Design' }
          ],
          criticRoles: []
        }]
      });

      // Index 2 is out of bounds (length 2) -> Fallback
      const role = getAgentRole(2, settings, 'roles');
      
      expect(role.id).toBe('fallback-roles-2');
      expect(role.name).toBe('Agent 3');
      expect(role.instruction).toBe('');
    });

    it('should return fallback role with ID when no roles exist', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const role = getAgentRole(0, settings, 'roles');
      
      expect(role.id).toBeDefined();
      expect(role.id).toBeTruthy();
      expect(role.name).toBe('Agent 1');
      expect(role.instruction).toBe('');
    });

    it('should return fallback critic role with ID when no critic roles exist', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Engineer', instruction: 'Code' }
          ],
          criticRoles: []
        }]
      });

      const role = getAgentRole(0, settings, 'criticRoles');
      
      expect(role.id).toBeDefined();
      expect(role.id).toBeTruthy();
      expect(role.name).toBe('Critic 1');
      expect(role.instruction).toBe('');
    });

    it('should handle critic roles correctly', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Engineer', instruction: 'Code' }
          ],
          criticRoles: [
            { id: 'critic-1', name: 'Reviewer', instruction: 'Review' }
          ]
        }]
      });

      const role = getAgentRole(0, settings, 'criticRoles');
      
      expect(role.id).toBe('critic-1');
      expect(role.name).toBe('Reviewer');
      expect(role.instruction).toBe('Review');
    });

    it('should use first profile when activeRoleProfileId not found', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'nonexistent',
        roleProfiles: [{
          id: 'fallback-profile',
          name: 'Fallback',
          roles: [
            { id: 'fallback-role', name: 'Fallback Role', instruction: 'Fallback' }
          ],
          criticRoles: []
        }]
      });

      const role = getAgentRole(0, settings, 'roles');
      
      expect(role.id).toBe('fallback-role');
      expect(role.name).toBe('Fallback Role');
    });

    it('should generate distinct deterministic IDs for different fallback indexes', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const role1 = getAgentRole(0, settings, 'roles');
      const role2 = getAgentRole(1, settings, 'roles');
      
      expect(role1.id).toBeTruthy();
      expect(role2.id).toBeTruthy();
      expect(role1.id).not.toBe(role2.id);
    });
  });
});
