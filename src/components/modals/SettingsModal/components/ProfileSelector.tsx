import React, { type FC } from 'react';
import { CustomSelect, type CustomSelectOption } from '@/components/ui/CustomSelect';

interface ProfileSelectorProps {
    profiles: { id: string; name: string }[];
    activeId: string;
    onChange: (id: string) => void;
    disabled?: boolean;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const ProfileSelector: FC<ProfileSelectorProps> = ({
    profiles,
    activeId,
    onChange,
    disabled = false,
    isOpen,
    onOpenChange,
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
            isOpen={isOpen}
            onOpenChange={onOpenChange}
        />
    );
};
