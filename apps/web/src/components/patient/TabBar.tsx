// =============================================================================
// Medgnosis — Patient Chart Tab Bar
// Horizontal tab navigation for clinical chart sections
// Supports ArrowLeft/Right keyboard navigation and full ARIA tablist/tab roles
// =============================================================================

import { useRef, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = (e: React.KeyboardEvent, currentId: string) => {
    const currentIndex = tabs.findIndex((t) => t.id === currentId);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);
    tabRefs.current.get(nextTab.id)?.focus();
  };

  return (
    <div className="surface p-0 overflow-hidden animate-fade-up stagger-2">
      <div
        role="tablist"
        aria-label="Patient chart sections"
        className="flex overflow-x-auto scrollbar-hidden"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={[
                'relative flex items-center gap-2 px-5 py-3 text-sm font-medium font-ui whitespace-nowrap',
                'transition-colors border-b-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal/50',
                isActive
                  ? 'text-teal border-b-teal bg-teal/5'
                  : 'text-dim border-b-transparent hover:text-bright hover:bg-s1',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={[
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-data tabular-nums px-1',
                    isActive ? 'bg-teal/15 text-teal' : 'bg-s2 text-ghost',
                  ].join(' ')}
                  aria-label={`${tab.count} items`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
