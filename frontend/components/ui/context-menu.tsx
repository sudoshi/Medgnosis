'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Transition } from '@headlessui/react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface ContextMenuItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string[];
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children?: ContextMenuItem[];
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  trigger: ReactNode;
  className?: string;
}

export function ContextMenu({
  items,
  trigger,
  className,
}: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const x = event.clientX;
    const y = event.clientY;

    // Adjust position if menu would go off screen
    const menuWidth = 220; // Approximate width of menu
    const menuHeight = items.length * 36; // Approximate height of menu
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const adjustedX = x + menuWidth > windowWidth ? x - menuWidth : x;
    const adjustedY = y + menuHeight > windowHeight ? y - menuHeight : y;

    setPosition({ x: adjustedX, y: adjustedY });
    setIsOpen(true);
  };

  return (
    <div onContextMenu={handleContextMenu}>
      {trigger}
      <Transition
        show={isOpen}
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <div
          ref={menuRef}
          className={cn(
            'fixed z-50 min-w-[220px] overflow-hidden rounded-md border border-dark-border bg-dark-secondary p-1 shadow-md',
            className
          )}
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          {items.map((item, index) => (
            <ContextMenuItem
              key={index}
              item={item}
              onClose={() => setIsOpen(false)}
            />
          ))}
        </div>
      </Transition>
    </div>
  );
}

interface ContextMenuItemProps {
  item: ContextMenuItem;
  onClose: () => void;
}

function ContextMenuItem({ item, onClose }: ContextMenuItemProps) {
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (!item.disabled && !item.children) {
      item.onClick?.();
      onClose();
    }
  };

  const handleMouseEnter = () => {
    if (item.children) {
      setIsSubMenuOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (item.children) {
      setIsSubMenuOpen(false);
    }
  };

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleClick}
        disabled={item.disabled}
        className={cn(
          'flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none',
          item.disabled && 'cursor-not-allowed opacity-50',
          !item.disabled && !item.danger && 'hover:bg-dark-border focus:bg-dark-border',
          item.danger && 'text-accent-error hover:bg-accent-error/10'
        )}
      >
        {item.icon && (
          <item.icon className="mr-2 h-4 w-4" />
        )}
        <span className="flex-1">{item.label}</span>
        {item.children && (
          <ChevronRightIcon className="ml-2 h-4 w-4" />
        )}
        {item.shortcut && (
          <div className="ml-4 flex items-center space-x-1">
            {item.shortcut.map((key, index) => (
              <kbd
                key={index}
                className="min-w-[1.5rem] rounded bg-dark-border px-1.5 text-xs font-medium text-dark-text-secondary"
              >
                {key}
              </kbd>
            ))}
          </div>
        )}
      </button>

      {item.children && isSubMenuOpen && (
        <div
          className="absolute left-full top-0 ml-0.5 min-w-[220px] rounded-md border border-dark-border bg-dark-secondary p-1 shadow-md"
          style={{
            // Adjust position if submenu would go off screen
            ...(itemRef.current &&
              itemRef.current.getBoundingClientRect().right + 220 >
                window.innerWidth && {
                right: '100%',
                left: 'auto',
                marginRight: '0.125rem',
                marginLeft: '0',
              }),
          }}
        >
          {item.children.map((child, index) => (
            <ContextMenuItem
              key={index}
              item={child}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}
