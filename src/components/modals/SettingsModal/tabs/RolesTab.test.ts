import { describe, it, expect } from 'vitest';
import { getRoleCyclingNotice } from './RolesTab';

describe('getRoleCyclingNotice', () => {
  it('should return null when every drafter agent has a role', () => {
    expect(getRoleCyclingNotice(4, 4, 'drafter')).toBeNull();
  });

  it('should return null when no roles are configured', () => {
    expect(getRoleCyclingNotice(5, 0, 'critic')).toBeNull();
  });

  it('should describe drafter role cycling when agents exceed roles', () => {
    expect(getRoleCyclingNotice(5, 4, 'drafter')).toBe(
      'There are 5 drafter agents and 4 drafter roles. Roles will repeat: agent 5 uses role 1, agent 6 uses role 2, and so on.'
    );
  });

  it('should describe critic role cycling with singular role label', () => {
    expect(getRoleCyclingNotice(5, 1, 'critic')).toBe(
      'There are 5 critic agents and 1 critic role. Roles will repeat: every agent uses role 1.'
    );
  });

  it('should describe critic role cycling with examples for repeated agents', () => {
    expect(getRoleCyclingNotice(5, 2, 'critic')).toBe(
      'There are 5 critic agents and 2 critic roles. Roles will repeat: agent 3 uses role 1, agent 4 uses role 2, and so on.'
    );
  });
});
