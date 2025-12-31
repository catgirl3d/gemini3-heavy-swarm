import React, { FC, ChangeEvent } from 'react';
import { AppSettings } from '@/types';
import { StepperControl } from '@/components/modals/SettingsModal/components/StepperControl';
import { TemperatureBanner } from '@/components/modals/SettingsModal/components/TemperatureBanner';
import { AVAILABLE_MODELS } from '@/components/modals/SettingsModal/constants';

interface GeneralSettingsTabProps {
    localSettings: AppSettings;
    handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    isModelUnlocked: boolean;
}

export const GeneralSettingsTab: FC<GeneralSettingsTabProps> = ({
    localSettings,
    handleChange,
    setLocalSettings,
    isModelUnlocked
}) => {
    const model = localSettings.model ?? 'gemini-3-flash-preview';

    return (
        <div className="settings-section fade-in">
            <div className="modal-card">
                <span className="modal-card-title">Core Configuration</span>
                <div className="modal-form-group">
                    <label className="modal-label">API Key (Optional)</label>
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
                    <label className="modal-label">Model</label>
                    <select
                        name="model"
                        value={!isModelUnlocked ? 'gemini-2.5-flash-lite' : (localSettings.model || 'gemini-3-flash-preview')}
                        onChange={handleChange}
                        className="modal-input"
                        disabled={!isModelUnlocked}
                    >
                        {AVAILABLE_MODELS.map(model => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                    </select>
                    {!isModelUnlocked && (
                        <p className="modal-help-text warning">
                            Only Gemini 2.5 Flash-Lite is available in Demo Mode. Add an API key to unlock all models.
                        </p>
                    )}
                </div>

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

                {model.includes('gemini-3') && (
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
                        name="dynamicAgentRoles"
                        id="dynamicAgentRoles"
                        checked={localSettings.dynamicAgentRoles || false}
                        onChange={handleChange}
                    />
                    <label htmlFor="dynamicAgentRoles" className="modal-label checkbox-label">
                        Dynamic Agent Roles (Visionary, Critic, etc.)
                    </label>
                </div>

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
