# Known Bugs

## Regeneration overlap race

- Status: Not user-facing in the current UI.
- Scope: `src/hooks/swarm/useSwarmRegeneration.ts`
- Note: the hook still supports abort-and-replace behavior for repeated regenerate calls on the same `messageId/stepId/agentIndex` key.
- Current UI behavior prevents a second regenerate for the same agent while the first one is working, so this is not reachable through normal interaction.
- Risk: future UI changes or programmatic calls could reintroduce the stale cleanup / rollback race.
