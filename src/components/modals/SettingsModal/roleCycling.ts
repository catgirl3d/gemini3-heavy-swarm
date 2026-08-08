export const getRoleCyclingNotice = (
  numAgents: number,
  roleCount: number,
  roleType: 'drafter' | 'critic'
): string | null => {
  if (roleCount === 0 || numAgents <= roleCount) return null;

  const agentLabel = roleType === 'drafter' ? 'drafter' : 'critic';
  const roleLabel = roleCount === 1 ? 'role' : 'roles';
  const repeatedAgent = roleCount + 1;

  if (roleCount === 1) {
    return `There are ${numAgents} ${agentLabel} agents and 1 ${agentLabel} role. Roles will repeat: every agent uses role 1.`;
  }

  return `There are ${numAgents} ${agentLabel} agents and ${roleCount} ${agentLabel} ${roleLabel}. Roles will repeat: agent ${repeatedAgent} uses role 1, agent ${repeatedAgent + 1} uses role 2, and so on.`;
};
