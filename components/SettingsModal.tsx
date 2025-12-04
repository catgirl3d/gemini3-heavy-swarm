import React, { FC, useState, useEffect, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, PromptProfile, RoleProfile } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

export const SettingsModal: FC<{
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  serverStatus?: { hasServerKey: boolean; proxyMode: string };
}> = ({ isOpen, onClose, settings, onSave, serverStatus }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<'general' | 'prompts' | 'roles'>('general');
  const [isEditingRoleName, setIsEditingRoleName] = useState(false);
  const [isEditingProfileName, setIsEditingProfileName] = useState(false);
  const [activeRoleType, setActiveRoleType] = useState<'drafter' | 'critic'>('drafter');
  const [activePresetMenu, setActivePresetMenu] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number, right: number } | null>(null);
  const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
  const [editingInstruction, setEditingInstruction] = useState<'initial' | 'refinement' | 'synthesizer' | null>(null);
  const [activeInstructionPresetMenu, setActiveInstructionPresetMenu] = useState<'initial' | 'refinement' | 'synthesizer' | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
        if (activePresetMenu !== null &&
            !(e.target as Element).closest('.preset-menu-container') &&
            !(e.target as Element).closest('.preset-menu-dropdown-portal')) {
            setActivePresetMenu(null);
            setDropdownPosition(null);
        }
        if (activeInstructionPresetMenu !== null &&
            !(e.target as Element).closest('.preset-menu-container') &&
            !(e.target as Element).closest('.preset-menu-dropdown-portal')) {
            setActiveInstructionPresetMenu(null);
            setDropdownPosition(null);
        }
    };

    if (isOpen) {
        window.addEventListener('keydown', handleEsc);
        window.addEventListener('click', handleClickOutside, true);
        document.body.style.overflow = 'hidden';
    }
    return () => {
        window.removeEventListener('keydown', handleEsc);
        window.removeEventListener('click', handleClickOutside, true);
        document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, activePresetMenu, activeInstructionPresetMenu]);

  if (!isOpen) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setLocalSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'numAgents' ? parseInt(value) || 1 : name === 'temperature' ? parseFloat(value) : value)
    }));
  };

  const handleReset = () => {
      setLocalSettings(DEFAULT_SETTINGS);
  };

  const activeProfile = localSettings.profiles?.find(p => p.id === localSettings.activeProfileId) || localSettings.profiles?.[0] || DEFAULT_SETTINGS.profiles[0];
  const activeRoleProfile = localSettings.roleProfiles?.find(p => p.id === localSettings.activeRoleProfileId) || localSettings.roleProfiles?.[0] || DEFAULT_SETTINGS.roleProfiles[0];

  // Determine if model selection should be unlocked
  // Unlocked if:
  // 1. User has a client-side API key (localSettings.apiKey or process.env.GEMINI_API_KEY)
  // 2. OR Server has a key AND is in 'private' mode
  const hasClientKey = !!localSettings.apiKey || !!process.env.GEMINI_API_KEY;
  const isPrivateServer = serverStatus?.hasServerKey && serverStatus?.proxyMode === 'private';
  const isModelUnlocked = hasClientKey || isPrivateServer;

  const handleProfileChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setLocalSettings(prev => ({
      ...prev,
      activeProfileId: e.target.value
    }));
  };

  const handleRoleProfileChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setLocalSettings(prev => ({
      ...prev,
      activeRoleProfileId: e.target.value
    }));
  };

  const handleInstructionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => {
      const newProfiles = prev.profiles.map(p => {
        if (p.id === prev.activeProfileId) {
          return { ...p, [name]: value };
        }
        return p;
      });
      return { ...prev, profiles: newProfiles };
    });
  };

  const handleCreateProfile = () => {
    const newProfile: PromptProfile = {
      id: `custom-${Date.now()}`,
      name: 'New Custom Profile',
      initialInstruction: activeProfile.initialInstruction,
      refinementInstruction: activeProfile.refinementInstruction,
      synthesizerInstruction: activeProfile.synthesizerInstruction
    };
    setLocalSettings(prev => ({
      ...prev,
      profiles: [...prev.profiles, newProfile],
      activeProfileId: newProfile.id
    }));
  };

  const handleCreateRoleProfile = () => {
    const newRoleProfile: RoleProfile = {
        id: `custom-roles-${Date.now()}`,
        name: 'New Role Set',
        roles: [...activeRoleProfile.roles],
        criticRoles: activeRoleProfile.criticRoles ? [...activeRoleProfile.criticRoles] : []
    };
    setLocalSettings(prev => ({
        ...prev,
        roleProfiles: [...(prev.roleProfiles || []), newRoleProfile],
        activeRoleProfileId: newRoleProfile.id
    }));
  };

  const handleDeleteProfile = () => {
    if (localSettings.profiles.length <= 1) return;
    setLocalSettings(prev => {
      const newProfiles = prev.profiles.filter(p => p.id !== prev.activeProfileId);
      return {
        ...prev,
        profiles: newProfiles,
        activeProfileId: newProfiles[0].id
      };
    });
  };

  const handleDeleteRoleProfile = () => {
    if ((localSettings.roleProfiles || []).length <= 1) return;
    setLocalSettings(prev => {
        const newProfiles = (prev.roleProfiles || []).filter(p => p.id !== prev.activeRoleProfileId);
        return {
            ...prev,
            roleProfiles: newProfiles,
            activeRoleProfileId: newProfiles[0].id
        };
    });
  };

  const handleRenameProfile = (newName: string) => {
    setLocalSettings(prev => {
      const newProfiles = prev.profiles.map(p => {
        if (p.id === prev.activeProfileId) {
          return { ...p, name: newName };
        }
        return p;
      });
      return { ...prev, profiles: newProfiles };
    });
  };

  const handleRenameRoleProfile = (newName: string) => {
    setLocalSettings(prev => {
        const newProfiles = (prev.roleProfiles || []).map(p => {
            if (p.id === prev.activeRoleProfileId) {
                return { ...p, name: newName };
            }
            return p;
        });
        return { ...prev, roleProfiles: newProfiles };
    });
  };

  const handleRoleChange = (index: number, field: 'name' | 'instruction', value: string) => {
    setLocalSettings(prev => {
      // Use the ID of the currently displayed profile to ensure we update what the user sees
      const targetId = activeRoleProfile.id;
      const newProfiles = (prev.roleProfiles || []).map(p => {
        if (p.id === targetId) {
            const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
            const currentRoles = p[roleKey] || [];
            const newRoles = [...currentRoles];
            if (newRoles[index]) {
                newRoles[index] = { ...newRoles[index], [field]: value };
            }
            return { ...p, [roleKey]: newRoles };
        }
        return p;
      });
      return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
    });
  };

  const handleApplyRole = (index: number, role: { name: string, instruction: string }) => {
    setLocalSettings(prev => {
      const targetId = activeRoleProfile.id;
      const newProfiles = (prev.roleProfiles || []).map(p => {
        if (p.id === targetId) {
            const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
            const currentRoles = p[roleKey] || [];
            const newRoles = [...currentRoles];
            if (newRoles[index]) {
                newRoles[index] = { ...newRoles[index], name: role.name, instruction: role.instruction };
            }
            return { ...p, [roleKey]: newRoles };
        }
        return p;
      });
      return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
    });
  };

  const getRolePresets = (profileId: string, type: 'drafter' | 'critic') => {
      // Find the default profile definition to get the canonical list of roles
      const defaultProfile = DEFAULT_SETTINGS.roleProfiles.find(p => p.id === profileId);
      const defaultRoles = defaultProfile ? (type === 'drafter' ? defaultProfile.roles : (defaultProfile.criticRoles || [])) : [];
      
      const profilePresets = defaultRoles.map(r => ({
          ...r,
          isCustom: false,
          id: `default-${r.name}` // Pseudo-ID for keying
      }));

      const savedPresets = (localSettings.savedRoles || []).map(r => ({
          name: r.name,
          instruction: r.instruction,
          isCustom: true,
          id: r.id
      }));

      const noRolePreset = {
          name: "No Role",
          instruction: "",
          isCustom: false,
          id: "default-no-role"
      };

      // Check if "No Role" is already in profilePresets or savedPresets to avoid duplicates
      const hasNoRole = [...savedPresets, ...profilePresets].some(p => p.name === "No Role");
      
      if (!hasNoRole) {
          return [noRolePreset, ...savedPresets, ...profilePresets];
      }

      return [...savedPresets, ...profilePresets];
  };

  const getInstructionPresets = (type: 'initial' | 'refinement' | 'synthesizer') => {
      const profilePresets = DEFAULT_SETTINGS.profiles.filter(p => p.id !== localSettings.activeProfileId).map(p => ({
          id: p.id,
          name: p.name,
          instruction: type === 'initial' ? p.initialInstruction : type === 'refinement' ? p.refinementInstruction : p.synthesizerInstruction,
          isCustom: false
      }));

      const savedPresets = (localSettings.savedInstructions || []).filter(i => i.type === type).map(i => ({
          id: i.id,
          name: i.name,
          instruction: i.content,
          isCustom: true
      }));

      return [...savedPresets, ...profilePresets];
  };

  const handleSaveInstructionPreset = () => {
      if (!editingInstruction || !newPresetName.trim()) return;
      
      const currentInstruction = editingInstruction === 'initial'
          ? activeProfile.initialInstruction
          : editingInstruction === 'refinement'
              ? activeProfile.refinementInstruction
              : activeProfile.synthesizerInstruction;

      setLocalSettings(prev => ({
          ...prev,
          savedInstructions: [
              ...(prev.savedInstructions || []),
              {
                  id: `saved-${Date.now()}`,
                  name: newPresetName.trim(),
                  type: editingInstruction,
                  content: currentInstruction
              }
          ]
      }));
      
      setNewPresetName('');
      setIsSavingPreset(false);
  };

  const handleDeleteInstructionPreset = (id: string) => {
      setLocalSettings(prev => ({
          ...prev,
          savedInstructions: (prev.savedInstructions || []).filter(i => i.id !== id)
      }));
  };

  const handleSaveRolePreset = () => {
      if (editingRoleIndex === null || !newPresetName.trim()) return;
      
      const roleList = activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles;
      const currentRole = (roleList || [])[editingRoleIndex];
      
      if (!currentRole) return;

      setLocalSettings(prev => ({
          ...prev,
          savedRoles: [
              ...(prev.savedRoles || []),
              {
                  id: `saved-role-${Date.now()}`,
                  name: newPresetName.trim(),
                  instruction: currentRole.instruction
              }
          ]
      }));
      
      setNewPresetName('');
      setIsSavingPreset(false);
  };

  const handleDeleteRolePreset = (id: string) => {
      setLocalSettings(prev => ({
          ...prev,
          savedRoles: (prev.savedRoles || []).filter(r => r.id !== id)
      }));
  };

  const handleApplyInstructionPreset = (type: 'initial' | 'refinement' | 'synthesizer', instruction: string) => {
      setLocalSettings(prev => {
          const newProfiles = prev.profiles.map(p => {
              if (p.id === prev.activeProfileId) {
                  return {
                      ...p,
                      [type === 'initial' ? 'initialInstruction' : type === 'refinement' ? 'refinementInstruction' : 'synthesizerInstruction']: instruction
                  };
              }
              return p;
          });
          return { ...prev, profiles: newProfiles };
      });
  };

  const handleAddRole = () => {
    setLocalSettings(prev => {
        const targetId = activeRoleProfile.id;
        const newProfiles = (prev.roleProfiles || []).map(p => {
            if (p.id === targetId) {
                const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                const currentRoles = p[roleKey] || [];
                return { ...p, [roleKey]: [...currentRoles, { name: 'New Role', instruction: '' }] };
            }
            return p;
        });
        return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
    });
  };

  const handleDeleteRole = (index: number) => {
    setLocalSettings(prev => {
        const targetId = activeRoleProfile.id;
        const newProfiles = (prev.roleProfiles || []).map(p => {
            if (p.id === targetId) {
                const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                const currentRoles = p[roleKey] || [];
                const newRoles = [...currentRoles];
                newRoles.splice(index, 1);
                return { ...p, [roleKey]: newRoles };
            }
            return p;
        });
        return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
    });
  };

  const handleMoveRole = (index: number, direction: 'up' | 'down') => {
    setLocalSettings(prev => {
        const targetId = activeRoleProfile.id;
        const newProfiles = (prev.roleProfiles || []).map(p => {
            if (p.id === targetId) {
                const roleKey = activeRoleType === 'drafter' ? 'roles' : 'criticRoles';
                const currentRoles = p[roleKey] || [];
                const newRoles = [...currentRoles];
                if (direction === 'up' && index > 0) {
                    [newRoles[index], newRoles[index - 1]] = [newRoles[index - 1], newRoles[index]];
                } else if (direction === 'down' && index < newRoles.length - 1) {
                    [newRoles[index], newRoles[index + 1]] = [newRoles[index + 1], newRoles[index]];
                }
                return { ...p, [roleKey]: newRoles };
            }
            return p;
        });
        return { ...prev, roleProfiles: newProfiles, activeRoleProfileId: targetId };
    });
  };

  const mainModal = createPortal(
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
        
        <div className="settings-tabs">
            <button 
                className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
            >
                General
            </button>
            <button 
                className={`settings-tab ${activeTab === 'prompts' ? 'active' : ''}`}
                onClick={() => setActiveTab('prompts')}
            >
                Prompt Profiles
            </button>
            <button
                className={`settings-tab ${activeTab === 'roles' ? 'active' : ''}`}
                onClick={() => setActiveTab('roles')}
            >
                Agent Roles
            </button>
        </div>

        <div className="settings-modal-body">
            {activeTab === 'general' ? (
                <div className="settings-section fade-in">
                    <div className="settings-card">
                        <span className="settings-card-title">Core Configuration</span>
                        <div className="settings-form-group">
                            <label className="settings-label">API Key (Optional)</label>
                            <input
                                type="password"
                                name="apiKey"
                                value={localSettings.apiKey || ''}
                                onChange={handleChange}
                                className="settings-input"
                                placeholder="Enter your Gemini API Key"
                            />
                            <p className="settings-help-text">
                                Leave empty to use the default key (if configured). Your key is stored locally in your browser.
                            </p>
                        </div>

                        <div className="settings-form-group">
                            <label className="settings-label">Model</label>
                            <select
                                name="model"
                                value={!isModelUnlocked ? 'gemini-2.5-flash-lite' : (localSettings.model || 'gemini-3-pro-preview')}
                                onChange={handleChange}
                                className="settings-input"
                                disabled={!isModelUnlocked}
                            >
                                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                                <option value="gemini-3-pro-preview">Gemini 3 Pro (Preview)</option>
                            </select>
                            {!isModelUnlocked && (
                                <p className="settings-help-text warning">
                                    Only Gemini 2.5 Flash-Lite is available in Demo Mode. Add an API key to unlock all models.
                                </p>
                            )}
                        </div>

                        <div className="settings-row">
                            <div className="settings-form-group">
                                <label className="settings-label">Number of Agents</label>
                                <div className="stepper-control">
                                    <button
                                        className="stepper-btn"
                                        onClick={() => setLocalSettings(prev => ({ ...prev, numAgents: Math.max(1, prev.numAgents - 1) }))}
                                        disabled={localSettings.numAgents <= 1}
                                    >
                                        −
                                    </button>
                                    <div className="stepper-value">{localSettings.numAgents}</div>
                                    <button
                                        className="stepper-btn"
                                        onClick={() => setLocalSettings(prev => ({ ...prev, numAgents: Math.min(8, prev.numAgents + 1) }))}
                                        disabled={localSettings.numAgents >= 8}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <div className="settings-form-group">
                                <label className="settings-label">
                                    Temperature ({localSettings.model.includes('gemini-3') && !localSettings.unsafeTemperature ? '1.0' : (localSettings.temperature ?? 0.7)})
                                </label>
                                <input
                                    type="range"
                                    name="temperature"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={localSettings.model.includes('gemini-3') && !localSettings.unsafeTemperature ? 1.0 : (localSettings.temperature ?? 0.7)}
                                    onChange={handleChange}
                                    disabled={localSettings.model.includes('gemini-3') && !localSettings.unsafeTemperature}
                                    className={`settings-input ${localSettings.model.includes('gemini-3') && !localSettings.unsafeTemperature ? 'settings-input-disabled' : ''}`}
                                />
                            </div>
                        </div>
                        
                        {localSettings.model.includes('gemini-3') && (
                            <div className="advanced-temperature-banner">
                                <div className="advanced-temperature-header">
                                    <div className="advanced-temperature-title">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                            <line x1="12" y1="9" x2="12" y2="13"></line>
                                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                        </svg>
                                        <span>Force Temperature (Advanced)</span>
                                    </div>
                                    <button
                                        className={`advanced-temperature-toggle ${localSettings.unsafeTemperature ? 'active' : ''}`}
                                        onClick={() => setLocalSettings(prev => ({ ...prev, unsafeTemperature: !prev.unsafeTemperature }))}
                                    >
                                        {localSettings.unsafeTemperature ? 'Disable' : 'Enable'}
                                    </button>
                                </div>
                                <p className="advanced-temperature-description">
                                    Gemini 3.0 works best with its default temperature (1.0). Forcing a custom temperature may cause the model to get stuck or degrade quality. Use with caution.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="settings-card">
                        <span className="settings-card-title">Workflow</span>
                        <div className="settings-form-group checkbox-group">
                            <input
                                type="checkbox"
                                name="dynamicAgentRoles"
                                id="dynamicAgentRoles"
                                checked={localSettings.dynamicAgentRoles || false}
                                onChange={handleChange}
                            />
                            <label htmlFor="dynamicAgentRoles" className="settings-label checkbox-label">
                                Dynamic Agent Roles (Visionary, Critic, etc.)
                            </label>
                        </div>

                        <div className="settings-form-group checkbox-group">
                            <input
                                type="checkbox"
                                name="pauseAfterInitial"
                                id="pauseAfterInitial"
                                checked={localSettings.pauseAfterInitial || false}
                                onChange={handleChange}
                            />
                            <label htmlFor="pauseAfterInitial" className="settings-label checkbox-label">
                                Pause after Initial Drafts
                            </label>
                        </div>

                        <div className="settings-form-group checkbox-group">
                            <input
                                type="checkbox"
                                name="pauseAfterRefinement"
                                id="pauseAfterRefinement"
                                checked={localSettings.pauseAfterRefinement || false}
                                onChange={handleChange}
                            />
                            <label htmlFor="pauseAfterRefinement" className="settings-label checkbox-label">
                                Pause after Critics (Refinement)
                            </label>
                        </div>
                    </div>

                    <div className="settings-card">
                        <span className="settings-card-title">System</span>
                        <div className="settings-form-group checkbox-group">
                            <input
                                type="checkbox"
                                name="devMode"
                                id="devMode"
                                checked={localSettings.devMode || false}
                                onChange={handleChange}
                            />
                            <label htmlFor="devMode" className="settings-label checkbox-label">
                                Development Mode (Simulation)
                            </label>
                        </div>

                        <div className="settings-form-group checkbox-group">
                            <input
                                type="checkbox"
                                name="debugMode"
                                id="debugMode"
                                checked={localSettings.debugMode || false}
                                onChange={handleChange}
                            />
                            <label htmlFor="debugMode" className="settings-label checkbox-label">
                                Debug Logging (Console)
                            </label>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'prompts' ? (
                <div className="settings-section fade-in">
                    <div className="profile-header-compact">
                        <div className="profile-select-wrapper">
                            <span className="profile-select-label">Active Profile</span>
                            {isEditingProfileName ? (
                                <div className="profile-name-edit">
                                    <input
                                        type="text"
                                        value={activeProfile.name}
                                        onChange={(e) => handleRenameProfile(e.target.value)}
                                        onBlur={() => setIsEditingProfileName(false)}
                                        onKeyDown={(e) => e.key === 'Enter' && setIsEditingProfileName(false)}
                                        className="edit-name-input"
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="profile-name-edit">
                                    <select
                                        value={localSettings.activeProfileId}
                                        onChange={handleProfileChange}
                                        className="settings-input font-semibold"
                                    >
                                        {localSettings.profiles.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="edit-name-btn"
                                        onClick={() => setIsEditingProfileName(true)}
                                        title="Rename Profile"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="profile-actions">
                            <button className="settings-btn outline" onClick={handleCreateProfile}>+ New</button>
                            {localSettings.profiles.length > 1 && (
                                <button className="settings-btn danger" onClick={handleDeleteProfile}>Delete</button>
                            )}
                        </div>
                    </div>

                    <div className="roles-section-wrapper">
                        <div className="roles-toolbar">
                            <h4 className="roles-toolbar-title">System Instructions</h4>
                        </div>
                        <div className="roles-list-container">
                            <div className="roles-list">
                                {[
                                    {
                                        id: 'initial',
                                        label: 'Initial Agent Instruction',
                                        value: activeProfile.initialInstruction,
                                        help: 'Instructions for the agents drafting the first response.'
                                    },
                                    {
                                        id: 'refinement',
                                        label: 'Refinement Instruction',
                                        value: activeProfile.refinementInstruction,
                                        help: 'Instructions for agents critiquing the initial drafts.'
                                    },
                                    {
                                        id: 'synthesizer',
                                        label: 'Synthesizer Instruction',
                                        value: activeProfile.synthesizerInstruction,
                                        help: 'Instructions for the final agent merging all refined responses.'
                                    }
                                ].map((item, index) => {
                                    const presets = getInstructionPresets(item.id as any);
                                    return (
                                        <div key={item.id} className="role-item compact">
                                            <div className="role-compact-row">
                                                <div className="role-ordinal">#{index + 1}</div>
                                                
                                                <div className="role-main-content">
                                                    <div className="role-info-group">
                                                        <div className="role-name-display">
                                                            {item.label}
                                                        </div>
                                                        <div className="role-help-text">
                                                            {item.help}
                                                        </div>
                                                    </div>
                                                    
                                                    {presets.length > 0 && (
                                                        <div className="preset-menu-container">
                                                            <button
                                                                className={`preset-menu-trigger ${activeInstructionPresetMenu === item.id ? 'active' : ''}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (activeInstructionPresetMenu === item.id) {
                                                                        setActiveInstructionPresetMenu(null);
                                                                        setDropdownPosition(null);
                                                                    } else {
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        const spaceBelow = window.innerHeight - rect.bottom;
                                                                        const spaceAbove = rect.top;
                                                                        const dropdownHeight = 200; // Approximate max height
                                                                        
                                                                        setDropdownPosition({
                                                                            top: spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? rect.top - dropdownHeight : rect.bottom,
                                                                            right: window.innerWidth - rect.right
                                                                        });
                                                                        setActiveInstructionPresetMenu(item.id as any);
                                                                    }
                                                                }}
                                                                title="Load a preset instruction"
                                                            >
                                                                <span>Presets</span>
                                                                <svg className="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="role-actions-compact">
                                                    <button
                                                        className="icon-btn edit-role-btn"
                                                        onClick={() => setEditingInstruction(item.id as any)}
                                                        title="Edit Instruction"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="settings-section fade-in">
                    <div className="profile-header-compact">
                        <div className="profile-select-wrapper">
                            <span className="profile-select-label">Active Role Set</span>
                            {isEditingRoleName ? (
                                <div className="profile-name-edit">
                                    <input
                                        type="text"
                                        value={activeRoleProfile.name}
                                        onChange={(e) => handleRenameRoleProfile(e.target.value)}
                                        onBlur={() => setIsEditingRoleName(false)}
                                        onKeyDown={(e) => e.key === 'Enter' && setIsEditingRoleName(false)}
                                        className="edit-name-input"
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="profile-name-edit">
                                    <select
                                        value={localSettings.activeRoleProfileId}
                                        onChange={handleRoleProfileChange}
                                        className="settings-input font-semibold"
                                    >
                                        {(localSettings.roleProfiles || []).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="edit-name-btn"
                                        onClick={() => setIsEditingRoleName(true)}
                                        title="Rename Role Set"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="profile-actions">
                            <button className="settings-btn outline" onClick={handleCreateRoleProfile}>+ New</button>
                            {(localSettings.roleProfiles || []).length > 1 && (
                                <button className="settings-btn danger" onClick={handleDeleteRoleProfile}>Delete</button>
                            )}
                        </div>
                    </div>

                    <div className="roles-section-wrapper">
                        <div className="roles-toolbar">
                            <div className="roles-toolbar-content">
                                <div className="role-type-toggle">
                                    <button
                                        className={`role-type-btn ${activeRoleType === 'drafter' ? 'active' : ''}`}
                                        onClick={() => setActiveRoleType('drafter')}
                                    >
                                        Drafters
                                    </button>
                                    <button
                                        className={`role-type-btn ${activeRoleType === 'critic' ? 'active' : ''}`}
                                        onClick={() => setActiveRoleType('critic')}
                                    >
                                        Critics
                                    </button>
                                </div>
                            </div>
                            <button className="add-role-btn-small" onClick={handleAddRole}>+ Add Role</button>
                        </div>
                        {!localSettings.dynamicAgentRoles && (
                            <div className="warning-banner">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                <span>
                                    <strong>Dynamic Agent Roles</strong> are currently disabled. These roles will not be used until you enable them in the <strong>General</strong> tab.
                                </span>
                                <button
                                    onClick={() => setLocalSettings(prev => ({ ...prev, dynamicAgentRoles: true }))}
                                    className="warning-banner-btn"
                                >
                                    Enable
                                </button>
                            </div>
                        )}
                        
                        <div className="roles-list-container">
                            <div className="roles-info-banner">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                                <span>
                                    Roles are applied during the <strong>{activeRoleType === 'drafter' ? 'Initial Draft' : 'Refinement (Critique)'}</strong> phase.
                                </span>
                            </div>
                            <div className="roles-list">
                                {((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || []).map((role, index) => {
                                    const presets = getRolePresets(activeRoleProfile.id, activeRoleType);
                                    return (
                                    <div key={index} className="role-item compact">
                                        <div className="role-compact-row">
                                            <div className="role-ordinal">#{index + 1}</div>
                                            
                                            <div className="role-main-content">
                                                <div className="role-name-display">
                                                    {role.name || 'Unnamed Role'}
                                                </div>
                                                
                                                {presets.length > 0 && (
                                                    <div className="preset-menu-container">
                                                        <button
                                                            className={`preset-menu-trigger ${activePresetMenu === index ? 'active' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (activePresetMenu === index) {
                                                                    setActivePresetMenu(null);
                                                                    setDropdownPosition(null);
                                                                } else {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const spaceBelow = window.innerHeight - rect.bottom;
                                                                    const spaceAbove = rect.top;
                                                                    const dropdownHeight = 200; // Approximate max height

                                                                    setDropdownPosition({
                                                                        top: spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? rect.top - dropdownHeight : rect.bottom,
                                                                        right: window.innerWidth - rect.right
                                                                    });
                                                                    setActivePresetMenu(index);
                                                                }
                                                            }}
                                                            title="Load a preset role"
                                                        >
                                                            <span>Presets</span>
                                                            <svg className="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="6 9 12 15 18 9"></polyline>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="role-actions-compact">
                                                <button
                                                    className="icon-btn edit-role-btn"
                                                    onClick={() => setEditingRoleIndex(index)}
                                                    title="Edit Role"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                    </svg>
                                                </button>
                                                
                                                <div className="role-move-buttons horizontal">
                                                    <button
                                                        className="move-role-btn"
                                                        onClick={() => handleMoveRole(index, 'up')}
                                                        disabled={index === 0}
                                                        title="Move Up"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M18 15l-6-6-6 6"/>
                                                        </svg>
                                                    </button>
                                                    <button
                                                        className="move-role-btn"
                                                        onClick={() => handleMoveRole(index, 'down')}
                                                        disabled={index === ((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || []).length - 1}
                                                        title="Move Down"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M6 9l6 6 6-6"/>
                                                        </svg>
                                                    </button>
                                                </div>

                                                <button
                                                    className="icon-btn delete-role-btn"
                                                    onClick={() => handleDeleteRole(index)}
                                                    title="Delete Role"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })}
                                {((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || []).length === 0 && (
                                    <div className="no-roles-message">
                                        No roles defined. Add a role to get started.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        <div className="settings-modal-footer">
            <button className="settings-btn reset" onClick={handleReset}>Reset to Defaults</button>
            <button className="settings-btn save" onClick={() => {
                const finalSettings = { ...localSettings };
                // If switching to proxy mode (no API key) AND not in private server mode, enforce the demo model
                const hasClientKey = !!finalSettings.apiKey || !!process.env.GEMINI_API_KEY;
                const isPrivateServer = serverStatus?.hasServerKey && serverStatus?.proxyMode === 'private';
                
                if (!hasClientKey && !isPrivateServer) {
                    finalSettings.model = 'gemini-2.5-flash-lite';
                }
                onSave(finalSettings);
                onClose();
            }}>Save Changes</button>
        </div>
      </div>
    </div>,
    document.body
  );

  // Render the Preset Menu Dropdown via Portal
  const presetDropdown = activePresetMenu !== null && dropdownPosition && (
      createPortal(
          <div
              className="preset-menu-dropdown preset-menu-dropdown-portal"
              style={{
                  position: 'fixed',
                  top: dropdownPosition.top,
                  right: dropdownPosition.right,
                  zIndex: 2000
              }}
              onClick={e => e.stopPropagation()}
          >
              <div className="preset-menu-header">Select a Role</div>
              {getRolePresets(activeRoleProfile.id, activeRoleType).map((p, i) => (
                  <div key={i} className="preset-menu-item-wrapper">
                    <button
                        className="preset-menu-item"
                        onClick={() => {
                            handleApplyRole(activePresetMenu, p);
                            setActivePresetMenu(null);
                            setDropdownPosition(null);
                        }}
                    >
                        <span className="preset-name">{p.name}</span>
                        {p.isCustom && <span className="preset-tag">Saved</span>}
                    </button>
                    {p.isCustom && (
                        <button
                            className="preset-delete-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRolePreset(p.id);
                            }}
                            title="Delete Preset"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                  </div>
              ))}
          </div>,
          document.body
      )
  );

  // Render the Instruction Preset Menu Dropdown via Portal
  const instructionPresetDropdown = activeInstructionPresetMenu !== null && dropdownPosition && (
      createPortal(
          <div
              className="preset-menu-dropdown preset-menu-dropdown-portal"
              style={{
                  position: 'fixed',
                  top: dropdownPosition.top,
                  right: dropdownPosition.right,
                  zIndex: 2000
              }}
              onClick={e => e.stopPropagation()}
          >
              <div className="preset-menu-header">Select a Preset</div>
              {getInstructionPresets(activeInstructionPresetMenu).map((p, i) => (
                  <div key={i} className="preset-menu-item-wrapper">
                    <button
                        className="preset-menu-item"
                        onClick={() => {
                            handleApplyInstructionPreset(activeInstructionPresetMenu, p.instruction);
                            setActiveInstructionPresetMenu(null);
                            setDropdownPosition(null);
                        }}
                    >
                        <span className="preset-name">{p.name}</span>
                        {p.isCustom && <span className="preset-tag">Saved</span>}
                    </button>
                    {p.isCustom && (
                        <button
                            className="preset-delete-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteInstructionPreset(p.id);
                            }}
                            title="Delete Preset"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                  </div>
              ))}
          </div>,
          document.body
      )
  );

  // Render the Edit Role Modal
  const editRoleModal = editingRoleIndex !== null && (
      createPortal(
        <div className="work-modal-overlay" onClick={() => setEditingRoleIndex(null)}>
            <div className="settings-modal role-edit-modal" onClick={e => e.stopPropagation()}>
                <div className="work-modal-header">
                    <h3>Edit Role #{editingRoleIndex + 1}</h3>
                    <button className="close-modal-button" onClick={() => setEditingRoleIndex(null)}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div className="settings-modal-body">
                    <div className="settings-form-group">
                        <label className="settings-label">Role Name</label>
                        <input
                            type="text"
                            value={((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [])[editingRoleIndex]?.name || ''}
                            onChange={(e) => handleRoleChange(editingRoleIndex, 'name', e.target.value)}
                            className="settings-input"
                            placeholder="e.g. Critic, Visionary"
                            autoFocus
                        />
                    </div>
                    <div className="settings-form-group">
                        <label className="settings-label">Role Instruction</label>
                        <textarea
                            value={((activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [])[editingRoleIndex]?.instruction || ''}
                            onChange={(e) => handleRoleChange(editingRoleIndex, 'instruction', e.target.value)}
                            className="settings-textarea role-instruction-textarea-large"
                            placeholder="Instructions for this specific role..."
                        />
                    </div>
                </div>
                <div className="settings-modal-footer space-between">
                    <div className="save-preset-container">
                        {isSavingPreset ? (
                            <div className="save-preset-input-group">
                                <input
                                    type="text"
                                    placeholder="Preset Name"
                                    value={newPresetName}
                                    onChange={(e) => setNewPresetName(e.target.value)}
                                    className="settings-input small"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRolePreset();
                                        if (e.key === 'Escape') setIsSavingPreset(false);
                                    }}
                                />
                                <button className="icon-btn save-confirm-btn" onClick={handleSaveRolePreset} disabled={!newPresetName.trim()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </button>
                                <button className="icon-btn save-cancel-btn" onClick={() => setIsSavingPreset(false)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <button className="settings-btn outline small" onClick={() => setIsSavingPreset(true)}>
                                Save as Preset
                            </button>
                        )}
                    </div>
                    <button className="settings-btn save" onClick={() => setEditingRoleIndex(null)}>Done</button>
                </div>
            </div>
        </div>,
        document.body
      )
  );

  // Render the Edit Instruction Modal
  const editInstructionModal = editingInstruction !== null && (
      createPortal(
        <div className="work-modal-overlay" onClick={() => setEditingInstruction(null)}>
            <div className="settings-modal role-edit-modal" onClick={e => e.stopPropagation()}>
                <div className="work-modal-header">
                    <h3>Edit {editingInstruction === 'initial' ? 'Initial Agent' : editingInstruction === 'refinement' ? 'Refinement' : 'Synthesizer'} Instruction</h3>
                    <button className="close-modal-button" onClick={() => setEditingInstruction(null)}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div className="settings-modal-body">
                    <div className="settings-form-group">
                        <label className="settings-label">Instruction</label>
                        <textarea
                            name={editingInstruction === 'initial' ? 'initialInstruction' : editingInstruction === 'refinement' ? 'refinementInstruction' : 'synthesizerInstruction'}
                            value={editingInstruction === 'initial' ? activeProfile.initialInstruction : editingInstruction === 'refinement' ? activeProfile.refinementInstruction : activeProfile.synthesizerInstruction}
                            onChange={handleInstructionChange}
                            className="settings-textarea role-instruction-textarea-large"
                            placeholder="Enter instructions..."
                            autoFocus
                        />
                    </div>
                </div>
                <div className="settings-modal-footer space-between">
                    <div className="save-preset-container">
                        {isSavingPreset ? (
                            <div className="save-preset-input-group">
                                <input
                                    type="text"
                                    placeholder="Preset Name"
                                    value={newPresetName}
                                    onChange={(e) => setNewPresetName(e.target.value)}
                                    className="settings-input small"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveInstructionPreset();
                                        if (e.key === 'Escape') setIsSavingPreset(false);
                                    }}
                                />
                                <button className="icon-btn save-confirm-btn" onClick={handleSaveInstructionPreset} disabled={!newPresetName.trim()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </button>
                                <button className="icon-btn save-cancel-btn" onClick={() => setIsSavingPreset(false)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <button className="settings-btn outline small" onClick={() => setIsSavingPreset(true)}>
                                Save as Preset
                            </button>
                        )}
                    </div>
                    <button className="settings-btn save" onClick={() => setEditingInstruction(null)}>Done</button>
                </div>
            </div>
        </div>,
        document.body
      )
  );

  return (
      <>
        {mainModal}
        {editRoleModal}
        {editInstructionModal}
        {presetDropdown}
        {instructionPresetDropdown}
      </>
  );
};