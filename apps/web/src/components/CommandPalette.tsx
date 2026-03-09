// =============================================================================
// Medgnosis Web — Command Palette (cmdk)
// Opens with Cmd+K, /, or the search button. Searches patients and provides
// quick navigation to any page via keyboard.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Layers,
  ListChecks,
  Bell,
  Settings,
  Search,
} from 'lucide-react';
import { useUiStore } from '../stores/ui.js';
import { api } from '../services/api.js';

// ─── Navigation items ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',  to: '/dashboard',  icon: LayoutDashboard, shortcut: 'D' },
  { label: 'Patients',   to: '/patients',   icon: Users,           shortcut: 'P' },
  { label: 'Measures',   to: '/measures',    icon: BarChart3,       shortcut: '' },
  { label: 'Bundles',    to: '/bundles',     icon: Layers,          shortcut: '' },
  { label: 'Care Lists', to: '/care-lists',  icon: ListChecks,      shortcut: '' },
  { label: 'Alerts',     to: '/alerts',      icon: Bell,            shortcut: 'A' },
  { label: 'Settings',   to: '/settings',    icon: Settings,        shortcut: '' },
] as const;

// ─── Patient search result type (matches /search endpoint) ──────────────────

interface SearchResult {
  patient_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  similarity: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommandPalette() {
  const navigate = useNavigate();
  const { searchOpen, setSearchOpen } = useUiStore();
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Search patients on debounced query ─────────────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setPatients([]);
      setLoading(false);
      return;
    }

    clearTimeout(debounceRef.current);
    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>(
          `/search?q=${encodeURIComponent(query)}`,
        );
        setPatients(res.data?.results ?? []);
      } catch {
        setPatients([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ── Reset state when closing ───────────────────────────────────────────
  const close = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    setPatients([]);
  }, [setSearchOpen]);

  // ── Global Cmd+K / Ctrl+K toggle (works even when focused inside dialog)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (searchOpen) {
          close();
        } else {
          setSearchOpen(true);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, close, setSearchOpen]);

  if (!searchOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-void/85 backdrop-blur-sm" aria-hidden="true" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-2xl rounded-panel border border-teal/25 shadow-teal-glow overflow-hidden animate-fade-up bg-s0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          label="Command palette"
          shouldFilter={true}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
              close();
            }
          }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-edge/30 h-[52px]">
            <Search
              size={18}
              strokeWidth={1.5}
              className="flex-shrink-0 text-dim"
              aria-hidden="true"
            />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search patients or jump to..."
              className="flex-1 bg-transparent border-none outline-none text-bright font-ui text-[15px] placeholder:text-ghost caret-teal"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-edge/40 font-data text-[10px] text-ghost bg-s1 leading-none">
              ESC
            </kbd>
          </div>

          {/* Results list */}
          <Command.List className="max-h-[360px] overflow-y-auto py-2 px-2 scrollbar-thin">
            <Command.Empty className="py-8 text-center text-sm text-ghost">
              {loading ? 'Searching...' : 'No results found.'}
            </Command.Empty>

            {/* Patient results */}
            {patients.length > 0 && (
              <Command.Group
                heading="Patients"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ghost"
              >
                {patients.map((pt) => (
                  <Command.Item
                    key={pt.patient_id}
                    value={`${pt.first_name} ${pt.last_name} ${pt.mrn}`}
                    onSelect={() => {
                      navigate(`/patients/${pt.patient_id}`);
                      close();
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-card cursor-pointer text-sm text-bright transition-colors duration-100 data-[selected=true]:bg-s1 data-[selected=true]:border-l-2 data-[selected=true]:border-teal"
                  >
                    <Users size={16} strokeWidth={1.5} className="flex-shrink-0 text-dim" />
                    <span className="flex-1 truncate">
                      {pt.last_name}, {pt.first_name}
                    </span>
                    <span className="text-xs text-dim font-data">
                      {pt.mrn}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation */}
            <Command.Group
              heading="Navigation"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ghost"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.to}
                    value={item.label}
                    onSelect={() => {
                      navigate(item.to);
                      close();
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-card cursor-pointer text-sm text-bright transition-colors duration-100 data-[selected=true]:bg-s1 data-[selected=true]:border-l-2 data-[selected=true]:border-teal"
                  >
                    <Icon size={16} strokeWidth={1.5} className="flex-shrink-0 text-dim" />
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-edge/40 font-data text-[10px] text-ghost bg-s1 leading-none">
                        {item.shortcut}
                      </kbd>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>

          {/* Footer hint bar */}
          <div className="flex items-center gap-4 px-4 h-9 border-t border-edge/25 bg-s1">
            <span className="text-ghost text-xs font-ui">
              <kbd className="font-data">↑↓</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="text-ghost text-xs font-ui">
              <kbd className="font-data">↵</kbd>
              <span className="ml-1">Open</span>
            </span>
            <span className="text-ghost text-xs font-ui">
              <kbd className="font-data">Esc</kbd>
              <span className="ml-1">Close</span>
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
