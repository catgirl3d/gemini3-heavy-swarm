
import { describe, it, expect } from 'vitest';
import {
    cloneWork,
    getStepContent,
    getStepResults,
    getStepThoughts,
    getStepUsage,
    getSynthesisErrorMessage,
    getSynthesisResult,
    getSynthesisThought,
    getSynthesisUsage,
    isSynthesisComplete,
    updateAgentWork,
    updateStepResult,
    withEnsuredResults
} from '../../src/utils/swarm/workHelpers';
import { STEPS } from '../../src/types/steps';
import { AgentState, TokenUsage, Work } from '../../src/types';

describe('workHelpers', () => {
    const usage: TokenUsage = {
        promptTokens: 1,
        candidatesTokens: 2,
        totalTokens: 3
    };

    describe('getter helpers', () => {
        it('returns array step results, thoughts, and usage for valid multi-agent data', () => {
            const work: Work = {
                results: {
                    [STEPS.INITIAL]: ['answer 1', null],
                    [`${STEPS.INITIAL}_thoughts`]: ['thought 1', null],
                    [`${STEPS.INITIAL}_usage`]: [usage, null]
                }
            };

            expect(getStepResults(work, STEPS.INITIAL)).toEqual(['answer 1', null]);
            expect(getStepContent(work, STEPS.INITIAL, 0)).toBe('answer 1');
            expect(getStepContent(work, STEPS.INITIAL, 1)).toBeNull();
            expect(getStepThoughts(work, STEPS.INITIAL)).toEqual(['thought 1', null]);
            expect(getStepUsage(work, STEPS.INITIAL)).toEqual([usage, null]);
        });

        it('returns empty arrays for missing or non-array step data', () => {
            const work: Work = {
                results: {
                    [STEPS.SYNTHESIS]: { text: 'final' },
                    [`${STEPS.INITIAL}_thoughts`]: 'not an array' as any,
                    [`${STEPS.SYNTHESIS}_usage`]: usage
                }
            };

            expect(getStepResults(work, STEPS.SYNTHESIS)).toEqual([]);
            expect(getStepContent(work, STEPS.INITIAL, 0)).toBeNull();
            expect(getStepContent(undefined, STEPS.INITIAL, 0)).toBeNull();
            expect(getStepResults({}, STEPS.INITIAL)).toEqual([]);
            expect(getStepThoughts(work, STEPS.INITIAL)).toEqual([]);
            expect(getStepUsage(work, STEPS.SYNTHESIS)).toEqual([]);
        });

        it('returns synthesis thought, usage, result, and error message when valid', () => {
            const work: Work = {
                results: {
                    [STEPS.SYNTHESIS]: {
                        text: 'final',
                        error: true,
                        errorMessage: 'failed',
                        sources: []
                    } as any,
                    [`${STEPS.SYNTHESIS}_thought`]: 'synthesis thought',
                    [`${STEPS.SYNTHESIS}_usage`]: usage
                }
            };

            expect(getSynthesisThought(work)).toBe('synthesis thought');
            expect(getSynthesisUsage(work)).toBe(usage);
            expect(getSynthesisResult(work)).toEqual({
                text: 'final',
                error: true,
                errorMessage: 'failed',
                sources: []
            });
            expect(getStepContent(work, STEPS.SYNTHESIS, 0)).toBe('final');
            expect(getSynthesisErrorMessage(work)).toBe('failed');
        });

        it('handles malformed synthesis data safely', () => {
            expect(getSynthesisResult({ results: { [STEPS.SYNTHESIS]: { error: true } as any } })).toEqual({ error: true });
            expect(getStepContent({ results: { [STEPS.SYNTHESIS]: { error: true } as any } }, STEPS.SYNTHESIS, 0)).toBeNull();
            expect(getSynthesisResult({ results: { [STEPS.SYNTHESIS]: { sources: [] } as any } })).toEqual({ sources: [] });
            expect(getSynthesisResult({ results: { [STEPS.SYNTHESIS]: ['bad'] as any } })).toBeNull();
            expect(getStepContent({ results: { [STEPS.SYNTHESIS]: ['bad'] as any } }, STEPS.SYNTHESIS, 0)).toBeNull();
            expect(getSynthesisThought({ results: { [`${STEPS.SYNTHESIS}_thought`]: { text: 'bad' } as any } })).toBeNull();
            expect(getSynthesisUsage({ results: { [`${STEPS.SYNTHESIS}_usage`]: { promptTokens: 1 } as any } })).toBeNull();
            expect(getSynthesisErrorMessage({ results: { [STEPS.SYNTHESIS]: { text: 'ok' } as any } })).toBeNull();
            expect(getSynthesisErrorMessage({ results: { [STEPS.SYNTHESIS]: { errorMessage: undefined } as any } })).toBeNull();
            expect(getSynthesisErrorMessage({ results: { [STEPS.SYNTHESIS]: { errorMessage: null } as any } })).toBeNull();
            expect(getSynthesisErrorMessage({ results: { [STEPS.SYNTHESIS]: { errorMessage: 123 } as any } })).toBeNull();
        });
    });

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
        it('should preserve existing synthesis object fields while updating text', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.SYNTHESIS]: {
                        text: 'old synthesis',
                        error: true,
                        errorMessage: 'old error'
                    }
                }
            };

            const updated = updateStepResult(originalWork, STEPS.SYNTHESIS, -1, 'new synthesis');

            expect(updated.results?.[STEPS.SYNTHESIS]).toEqual({
                text: 'new synthesis',
                error: true,
                errorMessage: 'old error'
            });
        });

        it('should sparsely extend multi-agent result arrays', () => {
            const updated = updateStepResult({}, STEPS.REFINEMENT, 2, 'third critic');

            expect(updated.results?.[STEPS.REFINEMENT]).toHaveLength(3);
            expect((updated.results?.[STEPS.REFINEMENT] as string[])[0]).toBeUndefined();
            expect((updated.results?.[STEPS.REFINEMENT] as string[])[1]).toBeUndefined();
            expect((updated.results?.[STEPS.REFINEMENT] as string[])[2]).toBe('third critic');
        });

        it('should ignore malformed legacy non-array multi-agent data', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.INITIAL]: 'bad legacy data' as any
                }
            };

            const updated = updateStepResult(originalWork, STEPS.INITIAL, 1, 'new value');
            const expectedResults = Array<string>(2);
            expectedResults[1] = 'new value';

            expect(updated.results?.[STEPS.INITIAL]).toEqual(expectedResults);
            expect((updated.results?.[STEPS.INITIAL] as string[])).not.toContain('b');
        });
    });

    describe('updateAgentWork', () => {
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

        it('should update multi-agent text, thought, and usage without mutating original arrays', () => {
            const existingUsage: TokenUsage = { totalTokens: 6, promptTokens: 2, candidatesTokens: 4 };
            const newUsage: TokenUsage = { totalTokens: 9, promptTokens: 4, candidatesTokens: 5 };
            const originalWork: Work = {
                results: {
                    [STEPS.INITIAL]: ['old 1', 'old 2'],
                    [`${STEPS.INITIAL}_thoughts`]: ['thought 1', 'thought 2'],
                    [`${STEPS.INITIAL}_usage`]: [existingUsage, null]
                }
            };

            const updated = updateAgentWork(originalWork, STEPS.INITIAL, 1, {
                text: 'new 2',
                thought: 'new thought 2',
                usage: newUsage
            });

            expect(updated.results?.[STEPS.INITIAL]).toEqual(['old 1', 'new 2']);
            expect(updated.results?.[`${STEPS.INITIAL}_thoughts`]).toEqual(['thought 1', 'new thought 2']);
            expect(updated.results?.[`${STEPS.INITIAL}_usage`]).toEqual([existingUsage, newUsage]);
            expect(originalWork.results?.[STEPS.INITIAL]).toEqual(['old 1', 'old 2']);
            expect(originalWork.results?.[`${STEPS.INITIAL}_thoughts`]).toEqual(['thought 1', 'thought 2']);
            expect(originalWork.results?.[`${STEPS.INITIAL}_usage`]).toEqual([existingUsage, null]);
        });

        it('should structurally share unchanged fields while cloning touched result paths', () => {
            const debugInfo = {
                custom: {
                    systemInstruction: 'system',
                    history: [],
                    userTurn: { parts: [] }
                }
            };
            const unrelatedObject = { keep: true };
            const unrelatedArray = ['preserve'];
            const agentStates = [{ id: 'agent-1' } as AgentState];
            const stepMetadata = [{ id: STEPS.INITIAL, status: 'working' as const, label: 'Initial Step' }];
            const originalWork: Work = {
                results: {
                    [STEPS.INITIAL]: ['old 1', 'old 2'],
                    unrelatedObject,
                    unrelatedArray
                },
                debugInfo: debugInfo as Work['debugInfo'],
                stepMetadata,
                agentStates,
                agentNames: ['Agent 1'],
                criticNames: ['Critic 1']
            };

            const updated = updateAgentWork(originalWork, STEPS.INITIAL, 1, {
                text: 'new 2',
                thought: 'new thought 2',
                usage
            });

            expect(updated).not.toBe(originalWork);
            expect(updated.results).not.toBe(originalWork.results);
            expect(updated.results?.[STEPS.INITIAL]).not.toBe(originalWork.results?.[STEPS.INITIAL]);
            expect(updated.results?.[`${STEPS.INITIAL}_thoughts`]).not.toBe(originalWork.results?.[`${STEPS.INITIAL}_thoughts`]);
            expect(updated.results?.[`${STEPS.INITIAL}_usage`]).not.toBe(originalWork.results?.[`${STEPS.INITIAL}_usage`]);
            expect(updated.results?.unrelatedObject).toBe(unrelatedObject);
            expect(updated.results?.unrelatedArray).toBe(unrelatedArray);
            expect(updated.debugInfo).toBe(originalWork.debugInfo);
            expect(updated.agentStates).toBe(agentStates);
            expect(updated.agentNames).toBe(originalWork.agentNames);
            expect(updated.criticNames).toBe(originalWork.criticNames);
            expect(updated.stepMetadata).toEqual(stepMetadata);
            expect(updated.stepMetadata).not.toBe(stepMetadata);
        });

        it('should initialize missing multi-agent arrays with step-specific defaults', () => {
            const updated = updateAgentWork({ results: {} }, STEPS.REFINEMENT, 2, {
                text: 'critic 3',
                thought: 'thinking 3',
                usage
            });

            expect(updated.results?.[STEPS.REFINEMENT]).toEqual(['', '', 'critic 3']);
            expect(updated.results?.[`${STEPS.REFINEMENT}_thoughts`]).toEqual(['', '', 'thinking 3']);
            expect(updated.results?.[`${STEPS.REFINEMENT}_usage`]).toEqual([null, null, usage]);
        });

        it('should return a cloned work object for empty updates', () => {
            const originalWork: Work = { results: { [STEPS.INITIAL]: ['old'] }, agentNames: ['Agent'] };

            const updated = updateAgentWork(originalWork, STEPS.INITIAL, 0, {});

            expect(updated).toEqual(originalWork);
            expect(updated).not.toBe(originalWork);
            expect(updated.results).not.toBe(originalWork.results);
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

        it('should clone metadata arrays, debugInfo, and result entries', () => {
            const original: Work = {
                results: { [STEPS.INITIAL]: ['a'] },
                debugInfo: { custom: { systemInstruction: 'system', history: [], userTurn: { parts: [] } } } as any,
                stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'done' }],
                criticNames: ['Critic']
            };

            const clone = cloneWork(original);

            expect(clone.debugInfo).toEqual(original.debugInfo);
            expect(clone.debugInfo).not.toBe(original.debugInfo);
            expect(clone.stepMetadata).toEqual(original.stepMetadata);
            expect(clone.stepMetadata).not.toBe(original.stepMetadata);
            expect(clone.criticNames).toEqual(original.criticNames);
            expect(clone.criticNames).not.toBe(original.criticNames);
            expect(clone.results?.[STEPS.INITIAL]).toEqual(original.results?.[STEPS.INITIAL]);
            expect(clone.results?.[STEPS.INITIAL]).not.toBe(original.results?.[STEPS.INITIAL]);
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

    describe('isSynthesisComplete', () => {
        const doneSynthesisState: AgentState = {
            id: 'synth',
            name: 'Synthesizer',
            status: 'done',
            label: 'Done',
            stepId: STEPS.SYNTHESIS
        };

        it('prefers synthesis step metadata when present', () => {
            expect(isSynthesisComplete({
                stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'done' }]
            }, [])).toBe(true);

            expect(isSynthesisComplete({
                stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'working' }]
            }, [doneSynthesisState])).toBe(false);
        });

        it('falls back to live synthesis agent states when metadata is missing', () => {
            expect(isSynthesisComplete(undefined, [doneSynthesisState])).toBe(true);
            expect(isSynthesisComplete({}, [
                { ...doneSynthesisState, stepId: STEPS.INITIAL }
            ])).toBe(false);
            expect(isSynthesisComplete({}, [
                { ...doneSynthesisState, status: 'working' }
            ])).toBe(false);
        });
    });
});
