// =============================================================================
// Medgnosis Web — Global Search / Command Palette  (Clinical Obsidian v2)
// Triggered by Ctrl/Cmd+K or the topbar search button
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowUp, ArrowDown, CornerDownLeft, Clock } from 'lucide-react';
import { useUiStore } from '../stores/ui.js';
import { api } from '../services/api.js';
import { formatDate } from '../utils/time.js';
import { PatientAvatar, getInitialsFromParts } from './PatientAvatar.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  patient_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  similarity: number;
}

// ─── Recent searches — persisted to sessionStorage ────────────────────────────

const RECENT_KEY = 'medgnosis:recent-searches';
const MAX_RECENT = 4;

function loadRecent(): SearchResult[] {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(result: SearchResult) {
  try {
    const prev = loadRecent().filter((r) => r.patient_id !== result.patient_id);
    const next = [result, ...prev].slice(0, MAX_RECENT);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({
  result,
  isSelected,
  onSelect,
  onMouseEnter,
}: {
  result: SearchResult;
  isSelected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const initials = getInitialsFromParts(result.first_name, result.last_name);
  const dob      = formatDate(result.date_of_birth);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      className={[
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-100',
        isSelected
          ? 'bg-s1 border-l-2 border-teal'
          : 'hover:bg-s1 border-l-2 border-transparent',
      ].join(' ')}
    >
      {/* Patient avatar */}
      <PatientAvatar initials={initials} seed={result.patient_id} />

      {/* Patient info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-bright truncate">
          {result.last_name}, {result.first_name}
        </p>
        <p className="text-xs text-dim font-data mt-0.5 truncate">
          MRN: {result.mrn}
          <span className="mx-1.5 text-ghost">·</span>
          DOB: {dob}
        </p>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <CornerDownLeft
          size={14}
          className="flex-shrink-0 text-teal"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ─── GlobalSearch ─────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const navigate = useNavigate();
  const { searchOpen, setSearchOpen } = useUiStore();

  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [loading, setLoading]           = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recent, setRecent]             = useState<SearchResult[]>(loadRecent);

  const clearRecent = () => {
    try { sessionStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
    setRecent([]);
  };

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Focus / reset when opened ──────────────────────────────────────────────
  useEffect(() => {
    if (searchOpen) {
      // slight delay to allow animation to start
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
    }
  }, [searchOpen]);

  // ── Reset selection when results change ───────────────────────────────────
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // ── Esc to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, setSearchOpen]);

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
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
        setResults(res.data?.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ── Navigate to patient ───────────────────────────────────────────────────
  const handleSelect = useCallback(
    (result: SearchResult) => {
      saveRecent(result);
      setSearchOpen(false);
      navigate(`/patients/${result.patient_id}`);
    },
    [navigate, setSearchOpen],
  );

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const activeList = query.trim() ? results : recent;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeList.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % activeList.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i <= 0 ? activeList.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && activeList[selectedIndex]) {
        handleSelect(activeList[selectedIndex]);
      }
    }
  };

  if (!searchOpen) return null;

  const showRecent  = !query.trim() && recent.length > 0;
  const showResults = query.trim() && !loading && results.length > 0;
  const showEmpty   = query.trim() && !loading && results.length === 0;
  const showHint    = !query.trim() && recent.length === 0;

  return (
    /* ── Backdrop ──────────────────────────────────────────────────────── */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      aria-modal="true"
      role="dialog"
      aria-label="Patient search"
    >
      {/* Click-away */}
      <div
        className="absolute inset-0 bg-void/85 backdrop-blur-sm"
        onClick={() => setSearchOpen(false)}
        aria-hidden="true"
      />

      {/* ── Search panel ─────────────────────────────────────────────── */}
      <div
        className={[
          'relative w-full max-w-2xl overflow-hidden',
          'bg-s0 border border-teal/25 rounded-panel',
          'shadow-teal-glow',
          'animate-fade-up',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Input row ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 border-b border-edge/30 h-[52px]">
          <Search
            size={18}
            strokeWidth={1.5}
            className="flex-shrink-0 text-dim"
            aria-hidden="true"
          />

          <input
            ref={inputRef}
            type="text"
            placeholder="Search patients by name or MRN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={[
              'flex-1 bg-transparent border-none outline-none',
              'text-bright font-ui text-[15px] placeholder:text-ghost',
              'caret-teal',
            ].join(' ')}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search patients"
          />

          {/* Clear button */}
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-card text-ghost hover:text-dim transition-colors"
              aria-label="Clear search"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* ── Results area ────────────────────────────────────────────── */}
        <div className="max-h-[360px] overflow-y-auto scrollbar-thin">

          {/* Loading */}
          {loading && (
            <div className="px-4 py-6 flex items-center gap-3">
              <div className="w-9 h-9 skeleton rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-text w-3/5" />
                <div className="skeleton-text-sm w-2/5" />
              </div>
            </div>
          )}

          {/* Recent searches */}
          {showRecent && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                <p className="data-label flex items-center gap-1.5">
                  <Clock size={11} strokeWidth={1.5} aria-hidden="true" />
                  Recent
                </p>
                <button
                  onClick={clearRecent}
                  className="text-[10px] font-ui text-ghost hover:text-dim transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/50 rounded"
                  aria-label="Clear recent searches"
                >
                  Clear
                </button>
              </div>
              {recent.map((r, i) => (
                <ResultRow
                  key={r.patient_id}
                  result={r}
                  isSelected={selectedIndex === i}
                  onSelect={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIndex(i)}
                />
              ))}
            </div>
          )}

          {/* Search results */}
          {showResults && (
            <div>
              <p className="px-4 pt-3 pb-1.5 data-label">
                {results.length} {results.length === 1 ? 'patient' : 'patients'} found
              </p>
              {results.map((r, i) => (
                <ResultRow
                  key={r.patient_id}
                  result={r}
                  isSelected={selectedIndex === i}
                  onSelect={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIndex(i)}
                />
              ))}
            </div>
          )}

          {/* No results */}
          {showEmpty && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-dim">
                No patients found for{' '}
                <span className="text-bright font-medium">"{query}"</span>
              </p>
              <p className="text-xs text-ghost mt-1">
                Try searching by full name or MRN number
              </p>
            </div>
          )}

          {/* Hint — no query, no recent */}
          {showHint && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-ghost">
                Type a patient name or MRN to search across{' '}
                <span className="text-dim">1M+ patients</span>
              </p>
            </div>
          )}
        </div>

        {/* ── Footer hint bar ──────────────────────────────────────────── */}
        {activeList.length > 0 && (
          <div className="flex items-center gap-4 px-4 h-9 border-t border-edge/25 bg-s1">
            <span className="flex items-center gap-1 text-ghost text-xs font-ui">
              <ArrowUp size={11} strokeWidth={2} aria-hidden="true" />
              <ArrowDown size={11} strokeWidth={2} aria-hidden="true" />
              <span className="ml-0.5">Navigate</span>
            </span>
            <span className="flex items-center gap-1 text-ghost text-xs font-ui">
              <CornerDownLeft size={11} strokeWidth={2} aria-hidden="true" />
              <span className="ml-0.5">Open</span>
            </span>
            <span className="text-ghost text-xs font-ui">
              <kbd className="font-data">Esc</kbd>
              <span className="ml-1">Close</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
