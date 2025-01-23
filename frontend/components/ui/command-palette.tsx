'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Dialog, Combobox, Transition } from '@headlessui/react';
import {
  CommandLineIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  name: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string[];
  onSelect?: () => void;
  disabled?: boolean;
}

export interface CommandGroup {
  name: string;
  items: CommandItem[];
}

export interface CommandPaletteProps {
  groups: CommandGroup[];
  shortcut?: string[];
  placeholder?: string;
  className?: string;
}

export function CommandPalette({
  groups,
  shortcut = ['⌘', 'K'],
  placeholder = 'Search commands...',
  className,
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredGroups = groups
    .map(group => ({
      name: group.name,
      items: group.items.filter(item =>
        [item.name, item.description]
          .filter(Boolean)
          .some(text =>
            text?.toLowerCase().includes(query.toLowerCase())
          )
      ),
    }))
    .filter(group => group.items.length > 0);

  const handleSelect = useCallback((item: CommandItem) => {
    if (item.disabled) return;
    item.onSelect?.();
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === shortcut[shortcut.length - 1].toLowerCase() &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcut]);

  return (
    <Transition.Root
      show={isOpen}
      as={Fragment}
      afterLeave={() => setQuery('')}
    >
      <Dialog
        onClose={setIsOpen}
        className={cn('fixed inset-0 z-50 overflow-y-auto p-4 pt-[25vh]', className)}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <Dialog.Panel className="mx-auto max-w-xl transform divide-y divide-dark-border overflow-hidden rounded-xl bg-dark-secondary shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
            <Combobox onChange={handleSelect}>
              <div className="relative">
                <MagnifyingGlassIcon
                  className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-dark-text-secondary"
                  aria-hidden="true"
                />
                <Combobox.Input
                  className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-dark-text-primary placeholder-dark-text-secondary focus:outline-none focus:ring-0 sm:text-sm"
                  placeholder={placeholder}
                  onChange={event => setQuery(event.target.value)}
                />
              </div>

              {filteredGroups.length > 0 && (
                <Combobox.Options
                  static
                  className="max-h-80 scroll-py-2 divide-y divide-dark-border overflow-y-auto"
                >
                  {filteredGroups.map(group => (
                    <li key={group.name}>
                      <h2 className="bg-dark-primary px-4 py-2.5 text-xs font-semibold text-dark-text-secondary">
                        {group.name}
                      </h2>
                      <ul className="text-sm text-dark-text-primary">
                        {group.items.map(item => (
                          <Combobox.Option
                            key={item.id}
                            value={item}
                            disabled={item.disabled}
                            className={({ active }) =>
                              cn(
                                'flex cursor-default select-none items-center px-4 py-2',
                                active && 'bg-dark-border',
                                item.disabled && 'cursor-not-allowed opacity-50'
                              )
                            }
                          >
                            {({ active }) => (
                              <>
                                <div className="flex flex-1 items-center space-x-3">
                                  {item.icon && (
                                    <item.icon
                                      className={cn(
                                        'h-5 w-5',
                                        active
                                          ? 'text-dark-text-primary'
                                          : 'text-dark-text-secondary'
                                      )}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <div>
                                    <div className="font-medium">
                                      {item.name}
                                    </div>
                                    {item.description && (
                                      <div className="text-xs text-dark-text-secondary">
                                        {item.description}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {item.shortcut && (
                                  <div className="ml-3 flex items-center space-x-1">
                                    {item.shortcut.map(key => (
                                      <kbd
                                        key={key}
                                        className={cn(
                                          'min-w-[1.5rem] rounded px-1.5 text-xs font-medium',
                                          active
                                            ? 'bg-dark-primary text-dark-text-primary'
                                            : 'bg-dark-border text-dark-text-secondary'
                                        )}
                                      >
                                        {key}
                                      </kbd>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </Combobox.Option>
                        ))}
                      </ul>
                    </li>
                  ))}
                </Combobox.Options>
              )}

              {query && filteredGroups.length === 0 && (
                <div className="px-6 py-14 text-center sm:px-14">
                  <CommandLineIcon
                    className="mx-auto h-6 w-6 text-dark-text-secondary"
                    aria-hidden="true"
                  />
                  <p className="mt-4 text-sm text-dark-text-secondary">
                    No commands found.
                  </p>
                </div>
              )}
            </Combobox>
          </Dialog.Panel>
        </Transition.Child>
      </Dialog>
    </Transition.Root>
  );
}
