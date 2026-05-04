import { describe, it, expect } from 'vitest';
import { AppSettings, ProviderType } from '@/types';
import { persistProviderModels, updateStepModel, updateRoleModel } from '@/utils/settings/providerPersistence';

describe('Provider Persistence Logic', () => {
    const initialSettings: AppSettings = {
        provider: ProviderType.Gemini,
        numAgents: 3,
        model: 'gemini-1.5-flash',
        apiKey: 'gemini-key',
        openRouterApiKey: 'or-key',
        openRouterModel: 'openai/gpt-4o',
        activeProfileId: '1',
        profiles: [],
        devMode: false,
        debugMode: false,
        simulateInitialError: 'none',
        simulateRefinementError: 'none',
        simulateSynthesisError: 'none',
        simulateInitialErrorAttempts: 1,
        simulateRefinementErrorAttempts: 1,
        simulateSynthesisErrorAttempts: 1,
        pauseAfterInitial: false,
        pauseAfterRefinement: false,
        useSearchInInitial: false,
        useSearchInRefinement: false,
        useSearchInSynthesis: false,
        temperature: 0.7,
        maxOutputTokens: 2048,
        activeRoleProfileId: '1',
        roleProfiles: [
            {
                id: '1',
                name: 'Default',
                roles: [
                    { id: 'drafter-1', name: 'Drafter 1', instruction: 'instr', model: 'gemini-model-1' },
                    { id: 'drafter-2', name: 'Drafter 2', instruction: 'instr' }
                ],
                criticRoles: [
                    { id: 'critic-1', name: 'Critic 1', instruction: 'instr', model: 'gemini-critic-1' }
                ]
            }
        ],
        savedInstructions: [],
        savedRoles: [],
        initialModel: 'gemini-initial',
        refinementModel: 'gemini-refinement',
        synthesisModel: 'gemini-synthesis',
        dynamicAgentRoles: true
    } as unknown as AppSettings;

    describe('persistProviderModels', () => {
        it('should save Gemini models and clear them when switching to OpenRouter', () => {
            const result = persistProviderModels(initialSettings, ProviderType.OpenRouter);
            
            expect(result.provider).toBe(ProviderType.OpenRouter);
            
            // Step models should be cleared (since no OpenRouter history exists)
            expect(result.initialModel).toBeUndefined();
            expect(result.refinementModel).toBeUndefined();
            expect(result.synthesisModel).toBeUndefined();
            
            // Role models should be cleared
            expect(result.roleProfiles![0].roles[0].model).toBeUndefined();
            expect(result.roleProfiles![0].roles[1].model).toBeUndefined();
            expect(result.roleProfiles![0].criticRoles![0].model).toBeUndefined();
            
            // Gemini models should be saved in providerModels
            const pm = result.providerModels!;
            expect(pm.stepModels![ProviderType.Gemini]).toEqual({
                initial: 'gemini-initial',
                refinement: 'gemini-refinement',
                synthesis: 'gemini-synthesis'
            });
            
            expect(pm.roleModels!['1'][ProviderType.Gemini]).toEqual({
                roles: { 'drafter-1': 'gemini-model-1' },
                criticRoles: { 'critic-1': 'gemini-critic-1' }
            });
        });

        it('should restore Gemini models when switching back from OpenRouter', () => {
            // 1. Switch to OpenRouter
            let state = persistProviderModels(initialSettings, ProviderType.OpenRouter);
            
            // 2. Set some OpenRouter specific models
            state.initialModel = 'or-initial';
            state.roleProfiles![0].roles[0].model = 'or-model-1';
            
            // 3. Switch back to Gemini
            state = persistProviderModels(state, ProviderType.Gemini);
            
            expect(state.provider).toBe(ProviderType.Gemini);
            
            // Gemini models should be restored
            expect(state.initialModel).toBe('gemini-initial');
            expect(state.refinementModel).toBe('gemini-refinement');
            expect(state.synthesisModel).toBe('gemini-synthesis');
            
            expect(state.roleProfiles![0].roles[0].model).toBe('gemini-model-1');
            expect(state.roleProfiles![0].criticRoles![0].model).toBe('gemini-critic-1');
            
            // OpenRouter models should be saved in providerModels
            const pm = state.providerModels!;
            expect(pm.stepModels![ProviderType.OpenRouter]).toEqual({
                initial: 'or-initial',
                refinement: undefined,
                synthesis: undefined
            });
            
            expect(pm.roleModels!['1'][ProviderType.OpenRouter]).toEqual({
                roles: { 'drafter-1': 'or-model-1' },
                criticRoles: undefined
            });
        });

        it('should handle multiple switches correctly', () => {
            // Switch Gemini -> OpenRouter -> Gemini -> OpenRouter
            let state = initialSettings;
            
            state = persistProviderModels(state, ProviderType.OpenRouter);
            state.initialModel = 'or-initial';
            
            state = persistProviderModels(state, ProviderType.Gemini);
            expect(state.initialModel).toBe('gemini-initial');
            
            state = persistProviderModels(state, ProviderType.OpenRouter);
            expect(state.initialModel).toBe('or-initial');
        });
    });



    describe('updateStepModel', () => {
        it('should update initialModel and sync with providerModels', () => {
            const result = updateStepModel(initialSettings, 'initialModel', 'new-gemini-initial');
            
            expect(result.success).toBe(true);
            expect(result.settings.initialModel).toBe('new-gemini-initial');
            expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBe('new-gemini-initial');
        });

        it('should update refinementModel and sync with providerModels', () => {
            const result = updateStepModel(initialSettings, 'refinementModel', 'new-gemini-refinement');
            
            expect(result.success).toBe(true);
            expect(result.settings.refinementModel).toBe('new-gemini-refinement');
            expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.refinement).toBe('new-gemini-refinement');
        });

        it('should update synthesisModel and sync with providerModels', () => {
            const result = updateStepModel(initialSettings, 'synthesisModel', 'new-gemini-synthesis');
            
            expect(result.success).toBe(true);
            expect(result.settings.synthesisModel).toBe('new-gemini-synthesis');
            expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.synthesis).toBe('new-gemini-synthesis');
        });

        it('should handle clearing models (undefined)', () => {
            const result = updateStepModel(initialSettings, 'initialModel', undefined);
            
            expect(result.success).toBe(true);
            expect(result.settings.initialModel).toBeUndefined();
            expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBeUndefined();
        });
    });

    describe('updateRoleModel', () => {
        it('should update drafter role model and sync with providerModels', () => {
            const result = updateRoleModel(initialSettings, '1', 'drafter', 'drafter-1', 'new-role-model');
            
            expect(result.success).toBe(true);
            expect(result.settings.roleProfiles![0].roles[0].model).toBe('new-role-model');
            expect(result.settings.providerModels?.roleModels?.['1']?.[ProviderType.Gemini]?.roles?.['drafter-1']).toBe('new-role-model');
        });

        it('should update critic role model and sync with providerModels', () => {
            const result = updateRoleModel(initialSettings, '1', 'critic', 'critic-1', 'new-critic-model');
            
            expect(result.success).toBe(true);
            expect(result.settings.roleProfiles![0].criticRoles![0].model).toBe('new-critic-model');
            expect(result.settings.providerModels?.roleModels?.['1']?.[ProviderType.Gemini]?.criticRoles?.['critic-1']).toBe('new-critic-model');
        });

        it('should handle clearing role models (undefined)', () => {
            const result = updateRoleModel(initialSettings, '1', 'drafter', 'drafter-1', undefined);
            
            expect(result.success).toBe(true);
            expect(result.settings.roleProfiles![0].roles[0].model).toBeUndefined();
            expect(result.settings.providerModels?.roleModels?.['1']?.[ProviderType.Gemini]?.roles).toBeUndefined();
        });
        
        it('should handle multiple role IDs', () => {
            let result = updateRoleModel(initialSettings, '1', 'drafter', 'drafter-1', 'model-0');
            expect(result.success).toBe(true);
            let state = result.settings;
            
            result = updateRoleModel(state, '1', 'drafter', 'drafter-2', 'model-1');
            expect(result.success).toBe(true);
            state = result.settings;
            
            expect(state.roleProfiles![0].roles[0].model).toBe('model-0');
            expect(state.roleProfiles![0].roles[1].model).toBe('model-1');
            
            const saved = state.providerModels?.roleModels?.['1']?.[ProviderType.Gemini]?.roles;
            expect(saved?.['drafter-1']).toBe('model-0');
            expect(saved?.['drafter-2']).toBe('model-1');
        });
    });
});

