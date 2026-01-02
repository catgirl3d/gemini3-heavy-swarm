import React, { FC, ChangeEvent } from 'react';
import { AppSettings, ServerStatus, ProviderType } from '@/types';
import { StepperControl } from '@/components/modals/SettingsModal/components/StepperControl';
import { TemperatureBanner } from '@/components/modals/SettingsModal/components/TemperatureBanner';
import { AVAILABLE_MODELS } from '@/components/modals/SettingsModal/constants';
import { ModelSelector } from '@/components/ui';

interface GeneralSettingsTabProps {
    localSettings: AppSettings;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    isModelUnlocked: boolean;
    openDropdownId: string | null;
    setOpenDropdownId: (id: string | null) => void;
    serverStatus?: ServerStatus;
}

export const GeneralSettingsTab: FC<GeneralSettingsTabProps> = ({
    localSettings,
    handleChange,
    setLocalSettings,
    isModelUnlocked,
    openDropdownId,
    setOpenDropdownId,
    serverStatus
}) => {
    const model = localSettings.model ?? 'gemini-3-flash-preview';
    const isGeminiDemo = !localSettings.apiKey && isModelUnlocked && serverStatus?.proxyMode !== 'private';

    return (
        <div className="settings-section fade-in">
            <div className="modal-card">
                <span className="modal-card-title">Core Configuration</span>
                
                <div className="modal-form-group">
                    <label className="modal-label">Provider</label>
                    <select
                        name="provider"
                        value={localSettings.provider || ProviderType.Gemini}
                        onChange={handleChange}
                        className="modal-input"
                    >
                        <option value={ProviderType.Gemini}>Google Gemini</option>
                        <option value={ProviderType.OpenRouter}>OpenRouter</option>
                    </select>
                </div>

                {localSettings.provider === ProviderType.Gemini ? (
                    <>
                        <div className="modal-form-group">
                            <label className="modal-label">Gemini API Key</label>
                            <input
                                type="password"
                                name="apiKey"
                                value={localSettings.apiKey || ''}
                                onChange={handleChange}
                                className="modal-input"
                                placeholder="Enter your Gemini API Key"
                            />
                            <p className="modal-help-text">
                                Leave empty to use the default key (if configured). Your key is stored locally in your browser.
                            </p>
                        </div>

                        <div className="modal-form-group">
                            <label className="modal-label">Gemini Model</label>
                            <ModelSelector
                                provider={ProviderType.Gemini}
                                value={!isModelUnlocked ? 'gemini-2.5-flash-lite' : (localSettings.model || 'gemini-3-flash-preview')}
                                onChange={(val) => handleChange({ target: { name: 'model', value: val } } as any)}
                                disabled={!isModelUnlocked || isGeminiDemo}
                                isOpen={openDropdownId === 'gemini-model'}
                                onOpenChange={(open) => setOpenDropdownId(open ? 'gemini-model' : null)}
                            />
                            {localSettings.apiKey && (
                                <p className="modal-help-text success">
                                    Personal API key in use. All models unlocked.
                                </p>
                            )}
                            {!localSettings.apiKey && isModelUnlocked && serverStatus?.proxyMode === 'private' && (
                                <p className="modal-help-text success">
                                    Private Server Mode. All models are unlocked via the server's API key.
                                </p>
                            )}
                            {!localSettings.apiKey && isModelUnlocked && serverStatus?.proxyMode !== 'private' && (
                                <p className="modal-help-text warning">
                                    Demo Mode: Using server-side key. Only Gemini 2.5 Flash-Lite is available. Add your own API key to unlock all models.
                                </p>
                            )}
                            {!localSettings.apiKey && !isModelUnlocked && (
                                <p className="modal-help-text danger">
                                    No API key available. Service is unavailable.
                                </p>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="modal-form-group">
                            <label className="modal-label">OpenRouter API Key</label>
                            <input
                                type="password"
                                name="openRouterApiKey"
                                value={localSettings.openRouterApiKey || ''}
                                onChange={handleChange}
                                className="modal-input"
                                placeholder="Enter your OpenRouter API Key"
                            />
                            <p className="modal-help-text">
                                Leave empty to use the server-side key (if configured).
                            </p>
                        </div>

                        <div className="modal-form-group">
                            <label className="modal-label">OpenRouter Model</label>
                            <ModelSelector
                                provider={ProviderType.OpenRouter}
                                value={localSettings.openRouterModel || ''}
                                onChange={(val) => handleChange({ target: { name: 'openRouterModel', value: val } } as any)}
                                placeholder="Select model..."
                                disabled={!isModelUnlocked}
                                isOpen={openDropdownId === 'openrouter-model'}
                                onOpenChange={(open) => setOpenDropdownId(open ? 'openrouter-model' : null)}
                                isDemoMode={!localSettings.openRouterApiKey && serverStatus?.proxyMode !== 'private'}
                            />
                            {localSettings.openRouterApiKey && (
                                <p className="modal-help-text success">
                                    Personal OpenRouter key in use. All models unlocked.
                                </p>
                            )}
                            {!localSettings.openRouterApiKey && isModelUnlocked && serverStatus?.proxyMode === 'private' && (
                                <p className="modal-help-text success">
                                    Private Server Mode. All models are unlocked via the server's API key.
                                </p>
                            )}
                            {!localSettings.openRouterApiKey && isModelUnlocked && serverStatus?.proxyMode !== 'private' && (
                                <p className="modal-help-text warning">
                                    Demo Mode: Using server-side key. Only free models are available. Add your own API key to unlock all models.
                                </p>
                            )}
                            {!localSettings.openRouterApiKey && !isModelUnlocked && (
                                <p className="modal-help-text danger">
                                    OpenRouter is not available. Add an API key or configure server-side key.
                                </p>
                            )}
                        </div>
                    </>
                )}

                <div className="settings-row">
                    <div className="modal-form-group">
                        <label className="modal-label">Number of Agents</label>
                        <StepperControl
                            value={localSettings.numAgents}
                            min={1}
                            max={5}
                            onValueChange={(val) => setLocalSettings(prev => ({ ...prev, numAgents: val }))}
                        />
                    </div>

                    <div className="modal-form-group">
                        <label className="modal-label">
                            Temperature ({model.includes('gemini-3') && !localSettings.unsafeTemperature ? '1.0' : (localSettings.temperature ?? 0.7)})
                        </label>
                        <input
                            type="range"
                            name="temperature"
                            min="0"
                            max="2"
                            step="0.1"
                            value={model.includes('gemini-3') && !localSettings.unsafeTemperature ? 1.0 : (localSettings.temperature ?? 0.7)}
                            onChange={handleChange}
                            disabled={model.includes('gemini-3') && !localSettings.unsafeTemperature}
                            className={`modal-input ${model.includes('gemini-3') && !localSettings.unsafeTemperature ? 'modal-input-disabled' : ''}`}
                        />
                    </div>
                </div>

                <div className="settings-row">
                    <div className="modal-form-group">
                        <label className="modal-label">
                            Max Output Tokens: <span className="token-value-highlight">{(localSettings.maxOutputTokens / 1000).toFixed(1)}k</span> ({localSettings.maxOutputTokens.toLocaleString()})
                        </label>
                        <input
                            type="range"
                            name="maxOutputTokens"
                            min="10"
                            max="65536"
                            step="1"
                            value={localSettings.maxOutputTokens || 65536}
                            onChange={handleChange}
                            className="modal-range-slider"
                        />
                        <div className="token-presets">
                            {[8192, 16384, 32768, 65536].map(val => (
                                <button
                                    key={val}
                                    type="button"
                                    className={`token-chip ${localSettings.maxOutputTokens === val ? 'active' : ''}`}
                                    onClick={() => setLocalSettings(prev => ({ ...prev, maxOutputTokens: val }))}
                                >
                                    {val === 65536 ? '64k (Max)' : `${(val / 1024).toFixed(0)}k`}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="token-chip"
                                onClick={() => {
                                    const val = window.prompt('Enter custom Max Output Tokens (10 - 65536):', localSettings.maxOutputTokens.toString());
                                    if (val) {
                                        const num = parseInt(val);
                                        if (!isNaN(num) && num >= 10 && num <= 65536) {
                                            setLocalSettings(prev => ({ ...prev, maxOutputTokens: num }));
                                        }
                                    }
                                }}
                            >
                                ✎ Custom
                            </button>
                        </div>
                        <p className="modal-help-text">
                            Maximum tokens the model can generate. The limit is 65,536 tokens.
                        </p>
                    </div>
                </div>

                {localSettings.provider === ProviderType.Gemini && model.includes('gemini-3') && (
                    <TemperatureBanner
                        isActive={!!localSettings.unsafeTemperature}
                        onToggle={() => setLocalSettings(prev => ({ ...prev, unsafeTemperature: !prev.unsafeTemperature }))}
                    />
                )}
            </div>

            <div className="modal-card">
                <span className="modal-card-title">Workflow</span>
                <div className="modal-form-group checkbox-group">
                    <input
                        type="checkbox"
                        name="pauseAfterInitial"
                        id="pauseAfterInitial"
                        checked={localSettings.pauseAfterInitial || false}
                        onChange={handleChange}
                    />
                    <label htmlFor="pauseAfterInitial" className="modal-label checkbox-label">
                        Pause after Initial Drafts
                    </label>
                </div>

                <div className="modal-form-group checkbox-group">
                    <input
                        type="checkbox"
                        name="pauseAfterRefinement"
                        id="pauseAfterRefinement"
                        checked={localSettings.pauseAfterRefinement || false}
                        onChange={handleChange}
                    />
                    <label htmlFor="pauseAfterRefinement" className="modal-label checkbox-label">
                        Pause after Critics (Refinement)
                    </label>
                </div>
            </div>

            {localSettings.provider === ProviderType.Gemini && (
                <div className="modal-card">
                    <span className="modal-card-title">Search Tools</span>
                    <div className="modal-form-group checkbox-group">
                        <input
                            type="checkbox"
                            name="useSearchInInitial"
                            id="useSearchInInitial"
                            checked={localSettings.useSearchInInitial || false}
                            onChange={handleChange}
                        />
                        <label htmlFor="useSearchInInitial" className="modal-label checkbox-label">
                            Use Google Search in Initial Drafts
                        </label>
                    </div>

                    <div className="modal-form-group checkbox-group">
                        <input
                            type="checkbox"
                            name="useSearchInRefinement"
                            id="useSearchInRefinement"
                            checked={localSettings.useSearchInRefinement || false}
                            onChange={handleChange}
                        />
                        <label htmlFor="useSearchInRefinement" className="modal-label checkbox-label">
                            Use Google Search in Critics (Refinement)
                        </label>
                    </div>

                    <div className="modal-form-group checkbox-group">
                        <input
                            type="checkbox"
                            name="useSearchInSynthesis"
                            id="useSearchInSynthesis"
                            checked={localSettings.useSearchInSynthesis || false}
                            onChange={handleChange}
                        />
                        <label htmlFor="useSearchInSynthesis" className="modal-label checkbox-label">
                            Use Google Search in Final Synthesis
                        </label>
                    </div>
                </div>
            )}

            <div className="modal-card">
                <span className="modal-card-title">System</span>
                <div className="modal-form-group checkbox-group">
                    <input
                        type="checkbox"
                        name="devMode"
                        id="devMode"
                        checked={localSettings.devMode || false}
                        onChange={handleChange}
                    />
                    <label htmlFor="devMode" className="modal-label checkbox-label">
                        Development Mode (Simulation)
                    </label>
                </div>
            </div>

            {import.meta.env.DEV && (
                <div className="modal-card">
                    <span className="modal-card-title">Debug</span>
                    <div className="modal-form-group checkbox-group">
                        <input
                            type="checkbox"
                            name="debugMode"
                            id="debugMode"
                            checked={localSettings.debugMode || false}
                            onChange={handleChange}
                        />
                        <label htmlFor="debugMode" className="modal-label checkbox-label">
                            Debug Logging (Console)
                        </label>
                    </div>

                    <div className="modal-form-group">
                        <div className="debug-simulation-row">
                            <div className="debug-simulation-type">
                                <label className="modal-label">Initial Error Simulation</label>
                                <select
                                    name="simulateInitialError"
                                    value={localSettings.simulateInitialError || 'none'}
                                    onChange={handleChange}
                                    className="modal-input"
                                >
                                    <option value="none">None (Normal Operation)</option>
                                    <option value="429">429 - Rate Limit Exceeded</option>
                                    <option value="500">500 - Internal Server Error</option>
                                    <option value="503">503 - Service Unavailable</option>
                                    <option value="timeout">Request Timeout</option>
                                </select>
                            </div>

                            {localSettings.simulateInitialError !== 'none' && (
                                <>
                                    <div className="debug-simulation-attempts">
                                        <label className="modal-label">Attempts</label>
                                        <StepperControl
                                            value={localSettings.simulateInitialErrorAttempts || 1}
                                            min={0}
                                            max={10}
                                            onValueChange={(val) => {
                                                if (val === 0) {
                                                    setLocalSettings(prev => ({
                                                        ...prev,
                                                        simulateInitialError: 'none',
                                                        simulateInitialErrorAttempts: 1
                                                    }));
                                                } else {
                                                    setLocalSettings(prev => ({
                                                        ...prev,
                                                        simulateInitialErrorAttempts: val
                                                    }));
                                                }
                                            }}
                                        />
                                    </div>
                                    <p className="modal-help-text">
                                        Will fail {localSettings.simulateInitialErrorAttempts || 1} time(s), then succeed on attempt {(localSettings.simulateInitialErrorAttempts || 1) + 1}.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="modal-form-group">
                        <div className="debug-simulation-row">
                            <div className="debug-simulation-type">
                                <label className="modal-label">Refinement Error Simulation</label>
                                <select
                                    name="simulateRefinementError"
                                    value={localSettings.simulateRefinementError || 'none'}
                                    onChange={handleChange}
                                    className="modal-input"
                                >
                                    <option value="none">None (Normal Operation)</option>
                                    <option value="429">429 - Rate Limit Exceeded</option>
                                    <option value="500">500 - Internal Server Error</option>
                                    <option value="503">503 - Service Unavailable</option>
                                    <option value="timeout">Request Timeout</option>
                                </select>
                            </div>

                            {localSettings.simulateRefinementError !== 'none' && (
                                <>
                                    <div className="debug-simulation-attempts">
                                        <label className="modal-label">Attempts</label>
                                        <StepperControl
                                            value={localSettings.simulateRefinementErrorAttempts || 1}
                                            min={0}
                                            max={10}
                                            onValueChange={(val) => {
                                                if (val === 0) {
                                                    setLocalSettings(prev => ({
                                                        ...prev,
                                                        simulateRefinementError: 'none',
                                                        simulateRefinementErrorAttempts: 1
                                                    }));
                                                } else {
                                                    setLocalSettings(prev => ({
                                                        ...prev,
                                                        simulateRefinementErrorAttempts: val
                                                    }));
                                                }
                                            }}
                                        />
                                    </div>
                                    <p className="modal-help-text">
                                        Will fail {localSettings.simulateRefinementErrorAttempts || 1} time(s), then succeed on attempt {(localSettings.simulateRefinementErrorAttempts || 1) + 1}.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="modal-form-group">
                        <div className="debug-simulation-row">
                            <div className="debug-simulation-type">
                                <label className="modal-label">Synthesis Error Simulation</label>
                                <select
                                    name="simulateSynthesisError"
                                    value={localSettings.simulateSynthesisError || 'none'}
                                    onChange={handleChange}
                                    className="modal-input"
                                >
                                    <option value="none">None (Normal Operation)</option>
                                    <option value="429">429 - Rate Limit Exceeded</option>
                                    <option value="500">500 - Internal Server Error</option>
                                    <option value="503">503 - Service Unavailable</option>
                                    <option value="timeout">Request Timeout</option>
                                </select>
                            </div>

                            {localSettings.simulateSynthesisError !== 'none' && (
                                <>
                                    <div className="debug-simulation-attempts">
                                        <label className="modal-label">Attempts</label>
                                        <StepperControl
                                            value={localSettings.simulateSynthesisErrorAttempts || 1}
                                            min={0}
                                            max={10}
                                            onValueChange={(val) => {
                                                if (val === 0) {
                                                    setLocalSettings(prev => ({
                                                        ...prev,
                                                        simulateSynthesisError: 'none',
                                                        simulateSynthesisErrorAttempts: 1
                                                    }));
                                                } else {
                                                    setLocalSettings(prev => ({
                                                        ...prev,
                                                        simulateSynthesisErrorAttempts: val
                                                    }));
                                                }
                                            }}
                                        />
                                    </div>
                                    <p className="modal-help-text">
                                        Will fail {localSettings.simulateSynthesisErrorAttempts || 1} time(s), then succeed on attempt {(localSettings.simulateSynthesisErrorAttempts || 1) + 1}.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
