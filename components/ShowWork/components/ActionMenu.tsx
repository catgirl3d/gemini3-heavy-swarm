import React, { FC, useState, useRef, useEffect, ReactNode } from 'react';
import { MoreActionsIcon } from '../icons';
import { PortalDropdown } from '@/components/PortalDropdown/PortalDropdown';

interface Action {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export const ActionMenu: FC<{ actions: Action[] }> = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="action-menu-container" ref={menuRef}>
      <button
        ref={triggerRef}
        className="modal-icon-btn action-menu-trigger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="More actions"
        aria-label="More actions"
      >
        <MoreActionsIcon />
      </button>
      
      <PortalDropdown
        isOpen={isOpen}
        triggerRef={triggerRef}
        className="action-menu-portal"
        width={200}
      >
        <div className="action-menu-dropdown">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`action-menu-item ${action.danger ? 'danger' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                action.onClick();
                setIsOpen(false);
              }}
            >
              <span className="action-icon">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </PortalDropdown>
    </div>
  );
};
