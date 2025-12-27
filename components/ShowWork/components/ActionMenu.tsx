import React, { FC, useState, useRef, useEffect, ReactNode } from 'react';
import { MoreActionsIcon } from '@/components/ShowWork/icons';

interface Action {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export const ActionMenu: FC<{ actions: Action[] }> = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        className="modal-icon-btn action-menu-trigger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        title="More actions"
        aria-label="More actions"
      >
        <MoreActionsIcon />
      </button>
      
      {isOpen && (
        <div className="action-menu-dropdown">
          {actions.map((action) => (
            <button
              key={action.label}
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
      )}
    </div>
  );
};
