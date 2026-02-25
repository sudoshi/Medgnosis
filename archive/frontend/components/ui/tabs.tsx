'use client';

import { Tab } from '@headlessui/react';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface TabsProps {
  tabs: {
    label: string;
    content: ReactNode;
    disabled?: boolean;
  }[];
  defaultIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  default: {
    list: 'flex space-x-1 rounded-xl bg-dark-primary p-1',
    tab: 'w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-dark-primary focus:outline-none focus:ring-2',
    selected: 'bg-dark-secondary shadow text-dark-text-primary',
    notSelected: 'text-dark-text-secondary hover:bg-dark-secondary/50 hover:text-dark-text-primary',
  },
  pills: {
    list: 'flex space-x-2',
    tab: 'rounded-full px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 ring-offset-2 ring-offset-dark-primary ring-accent-primary',
    selected: 'bg-accent-primary text-white',
    notSelected: 'text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-secondary',
  },
  underline: {
    list: 'flex space-x-8 border-b border-dark-border',
    tab: 'border-b-2 border-transparent py-4 px-1 text-sm font-medium focus:outline-none',
    selected: 'border-accent-primary text-accent-primary',
    notSelected: 'text-dark-text-secondary hover:border-dark-border hover:text-dark-text-primary',
  },
};

const sizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function Tabs({
  tabs,
  defaultIndex = 0,
  onChange,
  className,
  variant = 'default',
  size = 'md',
}: TabsProps) {
  const styles = variants[variant];

  return (
    <Tab.Group defaultIndex={defaultIndex} onChange={onChange}>
      <Tab.List className={cn(styles.list, className)}>
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            disabled={tab.disabled}
            className={({ selected }) =>
              cn(
                styles.tab,
                sizes[size],
                selected ? styles.selected : styles.notSelected,
                tab.disabled && 'cursor-not-allowed opacity-50'
              )
            }
          >
            {tab.label}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels className="mt-4">
        {tabs.map((tab, index) => (
          <Tab.Panel
            key={index}
            className={cn(
              'rounded-xl focus:outline-none focus:ring-2 ring-offset-2 ring-offset-dark-primary ring-accent-primary'
            )}
          >
            {tab.content}
          </Tab.Panel>
        ))}
      </Tab.Panels>
    </Tab.Group>
  );
}

export interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  return (
    <Tab.List
      className={cn(
        'flex space-x-1 rounded-xl bg-dark-primary p-1',
        className
      )}
    >
      {children}
    </Tab.List>
  );
}

export interface TabProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabItem({ children, className, disabled }: TabProps) {
  return (
    <Tab
      disabled={disabled}
      className={({ selected }) =>
        cn(
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
          'ring-white ring-opacity-60 ring-offset-2 ring-offset-dark-primary focus:outline-none focus:ring-2',
          selected
            ? 'bg-dark-secondary shadow text-dark-text-primary'
            : 'text-dark-text-secondary hover:bg-dark-secondary/50 hover:text-dark-text-primary',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )
      }
    >
      {children}
    </Tab>
  );
}

export interface TabPanelsProps {
  children: ReactNode;
  className?: string;
}

export function TabPanels({ children, className }: TabPanelsProps) {
  return <Tab.Panels className={cn('mt-4', className)}>{children}</Tab.Panels>;
}

export interface TabPanelProps {
  children: ReactNode;
  className?: string;
}

export function TabPanel({ children, className }: TabPanelProps) {
  return (
    <Tab.Panel
      className={cn(
        'rounded-xl focus:outline-none focus:ring-2 ring-offset-2 ring-offset-dark-primary ring-accent-primary',
        className
      )}
    >
      {children}
    </Tab.Panel>
  );
}
