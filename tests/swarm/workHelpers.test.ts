
import { describe, it, expect } from 'vitest';
import { updateStepResult, cloneWork, withEnsuredResults, updateAgentWork } from '../../src/utils/swarm/workHelpers';
import { STEPS } from '../../src/types/steps';
import { Work } from '../../src/types';

describe('workHelpers', () => {
    describe('updateStepResult', () => {
        it('should update multi-agent results without mutating original', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.INITIAL]: ['old 1', 'old 2']
                }
            };
            
            const updated = updateStepResult(originalWork, STEPS.INITIAL, 1, 'new 2');
            
            // Check update
            expect((updated.results?.[STEPS.INITIAL] as string[])[1]).toBe('new 2');
            // Check immutability
            expect((originalWork.results?.[STEPS.INITIAL] as string[])[1]).toBe('old 2');
            expect(updated.results).not.toBe(originalWork.results);
        });

        it('should update synthesis results as an object', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.SYNTHESIS]: { text: 'old synthesis' }
                }
            };
            
            const updated = updateStepResult(originalWork, STEPS.SYNTHESIS, -1, 'new synthesis');
            
            const result = updated.results?.[STEPS.SYNTHESIS] as { text: string };
            expect(result.text).toBe('new synthesis');
            expect(updated.results).not.toBe(originalWork.results);
        });

        it('should initialize results if missing', () => {
            const emptyWork: Work = {};
            const updated = updateStepResult(emptyWork, STEPS.INITIAL, 0, 'first');
            
            expect(updated.results?.[STEPS.INITIAL]).toEqual(['first']);
        });
        it('should handle legacy string in synthesis results', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.SYNTHESIS]: "legacy string" as any
                }
            };
            
            const updated = updateStepResult(originalWork, STEPS.SYNTHESIS, -1, 'new synthesis');
            
            const result = updated.results?.[STEPS.SYNTHESIS] as { text: string };
            expect(result).toEqual({ text: 'new synthesis' });
            expect(Object.keys(result)).not.toContain('0');
        });
    });

    describe('updateAgentWork', () => {
        it('should handle legacy string in synthesis results', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.SYNTHESIS]: "legacy string" as any
                }
            };
            
            const updated = updateAgentWork(originalWork, STEPS.SYNTHESIS, 0, { text: "new synthesis" });
            
            const result = updated.results?.[STEPS.SYNTHESIS] as { text: string };
            expect(result).toEqual({ text: "new synthesis" });
            expect(Object.keys(result)).not.toContain('0');
        });

        it('should update multiple fields atomically', () => {
            const originalWork: Work = {
                results: {}
            };
            
            const updated = updateAgentWork(originalWork, STEPS.SYNTHESIS, 0, {
                text: "text",
                thought: "thought",
                usage: { totalTokens: 10, promptTokens: 5, candidatesTokens: 5 }
            });
            
            expect(updated.results?.[STEPS.SYNTHESIS]).toEqual({ text: "text" });
            expect(updated.results?.[`${STEPS.SYNTHESIS}_thought`]).toBe("thought");
            expect(updated.results?.[`${STEPS.SYNTHESIS}_usage`]).toEqual({ totalTokens: 10, promptTokens: 5, candidatesTokens: 5 });
        });
    });

    describe('cloneWork', () => {
        it('should create a shallow-deep clone of the Work object', () => {
            const original: Work = {
                results: { [STEPS.INITIAL]: ['a'] },
                agentStates: [{ id: '1' } as any],
                agentNames: ['Name']
            };
            
            const clone = cloneWork(original);
            
            expect(clone).toEqual(original);
            expect(clone).not.toBe(original);
            expect(clone.results).not.toBe(original.results);
            expect(clone.agentStates).not.toBe(original.agentStates);
            expect(clone.agentNames).not.toBe(original.agentNames);
        });

        it('should handle missing optional properties during cloning', () => {
            const minimal: Work = { agentNames: ['Minimal'] };
            const clone = cloneWork(minimal);
            expect(clone).toEqual(minimal);
        });
    });

    describe('withEnsuredResults', () => {
        it('should return results if present', () => {
            const work: Work = { results: {} };
            const result = withEnsuredResults(work);
            expect(result.results).toBe(work.results);
        });

        it('should add empty results object if missing', () => {
            const work: Work = {};
            const result = withEnsuredResults(work);
            expect(result.results).toEqual({});
            expect(work.results).toBeUndefined(); // Should not mutate
        });
    });
});
