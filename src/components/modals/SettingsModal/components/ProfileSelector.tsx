import React, { FC } from 'react';
import { CustomSelect, CustomSelectOption } from '@/components/ui/CustomSelect';

interface ProfileSelectorProps {
    profiles: { id: string; name: string }[];
    activeId: string;
    onChange: (id: string) => void;
    disabled?: boolean;
}

export const ProfileSelector: FC<ProfileSelectorProps> = ({
    profiles,
    activeId,
    onChange,
    disabled = false,
}) => {
    // Convert profiles to CustomSelectOption format
    const options: CustomSelectOption<string>[] = profiles.map(p => ({
        value: p.id,
        label: p.name,
    }));

    return (
        <CustomSelect
            options={options}
            value={activeId}
            onChange={onChange}
            disabled={disabled}
            placeholder="Select Profile"
        />
    );
};
