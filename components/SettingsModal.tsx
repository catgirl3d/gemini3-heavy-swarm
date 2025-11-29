import React, { FC, useState, useEffect, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

export const SettingsModal: FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  settings: AppSettings; 
  onSave: (newSettings: AppSettings) => void;
}> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
        window.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
    }
    return () => {
        window.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setLocalSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'numAgents' ? parseInt(value) || 1 : value)
    }));
  };

  const handleReset = () => {
      setLocalSettings(DEFAULT_SETTINGS);
  };

  return createPortal(
    <div className="work-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="work-modal-header">
          <h3>Swarm Configuration</h3>
          <button className="close-modal-button" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div className="settings-modal-body">
            <div className="settings-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                    type="checkbox"
                    name="devMode"
                    id="devMode"
                    checked={localSettings.devMode || false}
                    onChange={handleChange}
                    style={{ width: 'auto', margin: 0 }}
                />
                <label htmlFor="devMode" className="settings-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Development Mode (Simulation)
                </label>
            </div>

            <div className="settings-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                    type="checkbox"
                    name="debugMode"
                    id="debugMode"
                    checked={localSettings.debugMode || false}
                    onChange={handleChange}
                    style={{ width: 'auto', margin: 0 }}
                />
                <label htmlFor="debugMode" className="settings-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Debug Logging (Console)
                </label>
            </div>

            <div className="settings-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                    type="checkbox"
                    name="pauseAfterInitial"
                    id="pauseAfterInitial"
                    checked={localSettings.pauseAfterInitial || false}
                    onChange={handleChange}
                    style={{ width: 'auto', margin: 0 }}
                />
                <label htmlFor="pauseAfterInitial" className="settings-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Pause after Initial Drafts
                </label>
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Model</label>
                <select
                    name="model"
                    value={localSettings.model || 'gemini-3-pro-preview'}
                    onChange={handleChange}
                    className="settings-input"
                >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro (Preview)</option>
                </select>
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Number of Agents (1-8)</label>
                <input 
                    type="number" 
                    name="numAgents" 
                    min="1" 
                    max="8" 
                    value={localSettings.numAgents} 
                    onChange={handleChange}
                    className="settings-input"
                />
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Initial Agent Instruction</label>
                <textarea 
                    name="initialInstruction" 
                    value={localSettings.initialInstruction} 
                    onChange={handleChange}
                    className="settings-textarea"
                />
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Refinement Instruction</label>
                <p className="settings-help">Instructions for agents critiquing the initial drafts.</p>
                <textarea 
                    name="refinementInstruction" 
                    value={localSettings.refinementInstruction} 
                    onChange={handleChange}
                    className="settings-textarea"
                />
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Synthesizer Instruction</label>
                 <p className="settings-help">Instructions for the final agent merging all refined responses.</p>
                <textarea 
                    name="synthesizerInstruction" 
                    value={localSettings.synthesizerInstruction} 
                    onChange={handleChange}
                    className="settings-textarea"
                />
            </div>
        </div>
        <div className="settings-modal-footer">
            <button className="settings-btn reset" onClick={handleReset}>Reset to Defaults</button>
            <button className="settings-btn save" onClick={() => { onSave(localSettings); onClose(); }}>Save Changes</button>
        </div>
      </div>
    </div>,
    document.body
  );
};