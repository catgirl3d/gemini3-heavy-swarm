import React, { FC } from 'react';

interface StepperControlProps {
    value: number;
    min: number;
    max: number;
    onValueChange: (newValue: number) => void;
}

export const StepperControl: FC<StepperControlProps> = ({ value, min, max, onValueChange }) => {
    return (
        <div className="stepper-control">
            <button
                className="stepper-btn"
                onClick={() => onValueChange(Math.max(min, value - 1))}
                disabled={value <= min}
            >
                −
            </button>
            <div className="stepper-value">{value}</div>
            <button
                className="stepper-btn"
                onClick={() => onValueChange(Math.min(max, value + 1))}
                disabled={value >= max}
            >
                +
            </button>
        </div>
    );
};
