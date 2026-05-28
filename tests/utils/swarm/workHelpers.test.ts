import { describe, expect, it } from 'vitest';
import type { AgentState, TokenUsage, Work } from '@/types';
import { STEPS } from '@/types/steps';
import {
    cloneWork,
    getStepContent,
    getStepResults,
    getStepThoughts,
    getStepUsage,
    getSynthesisErrorState,
    getSynthesisSources,
    isSynthesisComplete,
    markDownstreamStale,
    updateAgentWork,
    updateStepResult,
    withEnsuredResults
} from '@/utils/swarm/workHelpers';

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
                    [STEPS.SYNTHESIS]: { text: 'final' } as any,
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

        it('returns synthesis lane data and sidecars when valid', () => {
            const work: Work = {
                results: {
                    [STEPS.SYNTHESIS]: ['final'],
                    [`${STEPS.SYNTHESIS}_thoughts`]: ['synthesis thought'],
                    [`${STEPS.SYNTHESIS}_usage`]: [usage],
                    [`${STEPS.SYNTHESIS}_sources`]: [],
                    [`${STEPS.SYNTHESIS}_error`]: { flag: true, message: 'failed' }
                }
            };

            expect(getStepResults(work, STEPS.SYNTHESIS)).toEqual(['final']);
            expect(getStepThoughts(work, STEPS.SYNTHESIS)).toEqual(['synthesis thought']);
            expect(getStepUsage(work, STEPS.SYNTHESIS)).toEqual([usage]);
            expect(getStepContent(work, STEPS.SYNTHESIS, 0)).toBe('final');
            expect(getSynthesisSources(work)).toEqual([]);
            expect(getSynthesisErrorState(work)).toEqual({ flag: true, message: 'failed' });
        });

        it('handles malformed synthesis data safely', () => {
            expect(getStepContent({ results: { [STEPS.SYNTHESIS]: { error: true } as any } }, STEPS.SYNTHESIS, 0)).toBeNull();
            expect(getStepResults({ results: { [STEPS.SYNTHESIS]: { sources: [] } as any } }, STEPS.SYNTHESIS)).toEqual([]);
            expect(getStepContent({ results: { [STEPS.SYNTHESIS]: ['bad'] as any } }, STEPS.SYNTHESIS, 0)).toBe('bad');
            expect(getStepThoughts({ results: { [`${STEPS.SYNTHESIS}_thoughts`]: { text: 'bad' } as any } }, STEPS.SYNTHESIS)).toEqual([]);
            expect(getStepUsage({ results: { [`${STEPS.SYNTHESIS}_usage`]: { promptTokens: 1 } as any } }, STEPS.SYNTHESIS)).toEqual([]);
            expect(getSynthesisSources({ results: { [`${STEPS.SYNTHESIS}_sources`]: { uri: 'bad' } as any } })).toBeUndefined();
            expect(getSynthesisErrorState({ results: { [`${STEPS.SYNTHESIS}_error`]: { message: 'missing flag' } as any } })).toBeNull();
            expect(getSynthesisErrorState({ results: { [`${STEPS.SYNTHESIS}_error`]: { flag: true, message: 123 } as any } })).toBeNull();
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

            expect((updated.results?.[STEPS.INITIAL] as string[])[1]).toBe('new 2');
            expect((originalWork.results?.[STEPS.INITIAL] as string[])[1]).toBe('old 2');
            expect(updated.results).not.toBe(originalWork.results);
        });

        it('should update synthesis results as a slot-0 lane', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.SYNTHESIS]: ['old synthesis']
                }
            };

            const updated = updateStepResult(originalWork, STEPS.SYNTHESIS, 0, 'new synthesis');

            expect(updated.results?.[STEPS.SYNTHESIS]).toEqual(['new synthesis']);
            expect(updated.results).not.toBe(originalWork.results);
        });

        it('should initialize results if missing', () => {
            const emptyWork: Work = {};
            const updated = updateStepResult(emptyWork, STEPS.INITIAL, 0, 'first');

            expect(updated.results?.[STEPS.INITIAL]).toEqual(['first']);
        });

        it('should preserve synthesis sidecars while updating text lane', () => {
            const originalWork: Work = {
                results: {
                    [STEPS.SYNTHESIS]: ['old synthesis'],
                    [`${STEPS.SYNTHESIS}_error`]: { flag: true, message: 'old error' },
                    [`${STEPS.SYNTHESIS}_sources`]: [{ uri: 'https://example.com', title: 'Example' }]
                }
            };

            const updated = updateStepResult(originalWork, STEPS.SYNTHESIS, 0, 'new synthesis');

            expect(updated.results?.[STEPS.SYNTHESIS]).toEqual(['new synthesis']);
            expect(updated.results?.[`${STEPS.SYNTHESIS}_error`]).toEqual({ flag: true, message: 'old error' });
            expect(updated.results?.[`${STEPS.SYNTHESIS}_sources`]).toEqual([{ uri: 'https://example.com', title: 'Example' }]);
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
            expect(updated.results?.[STEPS.INITIAL] as string[]).not.toContain('b');
        });
    });

    describe('updateAgentWork', () => {
        it('should update multiple fields atomically', () => {
            const originalWork: Work = {
                results: {}
            };

            const updated = updateAgentWork(originalWork, STEPS.SYNTHESIS, 0, {
                text: 'text',
                thought: 'thought',
                usage: { totalTokens: 10, promptTokens: 5, candidatesTokens: 5 }
            });

            expect(updated.results?.[STEPS.SYNTHESIS]).toEqual(['text']);
            expect(updated.results?.[`${STEPS.SYNTHESIS}_thoughts`]).toEqual(['thought']);
            expect(updated.results?.[`${STEPS.SYNTHESIS}_usage`]).toEqual([{ totalTokens: 10, promptTokens: 5, candidatesTokens: 5 }]);
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
        it('should create an isolated clone of the Work object', () => {
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

        it('should recursively clone nested synthesis sources and debug content payloads', () => {
            const original: Work = {
                results: {
                    [STEPS.SYNTHESIS]: ['final answer'],
                    [`${STEPS.SYNTHESIS}_sources`]: [{ uri: 'https://example.com', title: 'Example' }]
                },
                debugInfo: {
                    [STEPS.SYNTHESIS]: {
                        systemInstruction: 'system',
                        history: [{
                            role: 'user',
                            parts: [
                                { text: 'hello' },
                                { inlineData: { mimeType: 'image/png', data: 'abc123' } }
                            ]
                        }],
                        userTurn: {
                            role: 'model',
                            parts: [
                                { text: 'answer' },
                                { thought: true, text: 'reasoning' }
                            ]
                        }
                    }
                } as Work['debugInfo']
            };

            const clone = cloneWork(original);
            const originalSynthesis = original.results?.[`${STEPS.SYNTHESIS}_sources`] as { uri: string; title: string }[];
            const clonedSynthesis = clone.results?.[`${STEPS.SYNTHESIS}_sources`] as { uri: string; title: string }[];
            const originalDebug = original.debugInfo?.[STEPS.SYNTHESIS] as {
                history: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
                userTurn: { parts: Array<{ text?: string; thought?: boolean }> };
            };
            const clonedDebug = clone.debugInfo?.[STEPS.SYNTHESIS] as typeof originalDebug;

            expect(clonedSynthesis).toEqual(originalSynthesis);
            expect(clonedSynthesis).not.toBe(originalSynthesis);
            expect(clonedSynthesis[0]).not.toBe(originalSynthesis[0]);

            expect(clonedDebug).toEqual(originalDebug);
            expect(clonedDebug).not.toBe(originalDebug);
            expect(clonedDebug.history).not.toBe(originalDebug.history);
            expect(clonedDebug.history[0]).not.toBe(originalDebug.history[0]);
            expect(clonedDebug.history[0].parts).not.toBe(originalDebug.history[0].parts);
            expect(clonedDebug.history[0].parts[0]).not.toBe(originalDebug.history[0].parts[0]);
            expect(clonedDebug.history[0].parts[1]).not.toBe(originalDebug.history[0].parts[1]);
            expect(clonedDebug.history[0].parts[1].inlineData).not.toBe(originalDebug.history[0].parts[1].inlineData);
            expect(clonedDebug.userTurn).not.toBe(originalDebug.userTurn);
            expect(clonedDebug.userTurn.parts).not.toBe(originalDebug.userTurn.parts);
            expect(clonedDebug.userTurn.parts[0]).not.toBe(originalDebug.userTurn.parts[0]);
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
            expect(work.results).toBeUndefined();
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

    describe('markDownstreamStale', () => {
        const createCompletedWork = (): Work => ({
            results: {
                [STEPS.INITIAL]: ['draft 1', 'draft 2'],
                [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
                [STEPS.SYNTHESIS]: ['final answer']
            },
            stepMetadata: [
                { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
                { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
                { id: STEPS.SYNTHESIS, status: 'done', label: 'Synthesis Step' }
            ],
            agentStates: [
                { id: 'initial-0', name: 'Agent 1', status: 'done', label: 'Drafted', stepId: STEPS.INITIAL, agentIndex: 0, messageId: 'msg-1' },
                { id: 'initial-1', name: 'Agent 2', status: 'done', label: 'Drafted', stepId: STEPS.INITIAL, agentIndex: 1, messageId: 'msg-1' },
                { id: 'refine-0', name: 'Critic 1', status: 'done', label: 'Refined', stepId: STEPS.REFINEMENT, agentIndex: 0, messageId: 'msg-1' },
                { id: 'refine-1', name: 'Critic 2', status: 'done', label: 'Refined', stepId: STEPS.REFINEMENT, agentIndex: 1, messageId: 'msg-1' },
                { id: 'synth-0', name: 'Synthesizer', status: 'done', label: 'Synthesized', stepId: STEPS.SYNTHESIS, agentIndex: 0, messageId: 'msg-1' }
            ]
        });

        it('marks downstream completed steps as stale without clearing their content', () => {
            const nextWork = markDownstreamStale(createCompletedWork(), STEPS.INITIAL);

            expect(nextWork.results?.[STEPS.REFINEMENT]).toEqual(['refined 1', 'refined 2']);
            expect(nextWork.results?.[STEPS.SYNTHESIS]).toEqual(['final answer']);
            expect(nextWork.stepMetadata?.find(meta => meta.id === STEPS.REFINEMENT)).toMatchObject({
                status: 'stale',
                staleFromStepId: STEPS.INITIAL
            });
            expect(nextWork.stepMetadata?.find(meta => meta.id === STEPS.SYNTHESIS)).toMatchObject({
                status: 'stale',
                staleFromStepId: STEPS.INITIAL
            });
            expect(nextWork.agentStates?.filter(agent => agent.stepId === STEPS.REFINEMENT).map(agent => agent.status)).toEqual(['stale', 'stale']);
            expect(nextWork.agentStates?.filter(agent => agent.stepId === STEPS.REFINEMENT).map(agent => agent.label)).toEqual(['Stale', 'Stale']);
            expect(nextWork.agentStates?.find(agent => agent.stepId === STEPS.SYNTHESIS)?.status).toBe('stale');
            expect(nextWork.agentStates?.find(agent => agent.stepId === STEPS.SYNTHESIS)?.label).toBe('Stale');
        });

        it('keeps pending downstream steps pending when they do not have prior results', () => {
            const pausedWork: Work = {
                results: {
                    [STEPS.INITIAL]: ['draft 1', 'draft 2'],
                    [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
                    [STEPS.SYNTHESIS]: ['']
                },
                stepMetadata: [
                    { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
                    { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
                    { id: STEPS.SYNTHESIS, status: 'pending', label: 'Synthesis Step' }
                ]
            };

            const nextWork = markDownstreamStale(pausedWork, STEPS.REFINEMENT);

            expect(nextWork.stepMetadata?.find(meta => meta.id === STEPS.SYNTHESIS)).toMatchObject({
                status: 'pending',
                label: 'Synthesis Step'
            });
        });
    });
});
