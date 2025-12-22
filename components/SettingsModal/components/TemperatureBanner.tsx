import React, { FC } from 'react';
import { WarningIcon } from '../icons';

interface TemperatureBannerProps {
    isActive: boolean;
    onToggle: () => void;
}

export const TemperatureBanner: FC<TemperatureBannerProps> = ({ isActive, onToggle }) => {
    return (
        <div className="modal-banner warning advanced-temperature-banner">
            <div className="advanced-temperature-header">
                <div className="advanced-temperature-title">
                    <WarningIcon />
                    <span>Force Temperature (Advanced)</span>
                </div>
                <button
                    className={`advanced-temperature-toggle ${isActive ? 'active' : ''}`}
                    onClick={onToggle}
                >
                    {isActive ? 'Disable' : 'Enable'}
                </button>
            </div>
            <p className="advanced-temperature-description">
                Gemini 3.0 works best with its default temperature (1.0). Forcing a custom temperature may cause the model to get stuck or degrade quality. Use with caution.
            </p>
        </div>
    );
};
