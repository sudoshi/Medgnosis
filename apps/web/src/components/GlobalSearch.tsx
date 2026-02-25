// =============================================================================
// Medgnosis Web — Global search (command palette)
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useUiStore } from '../stores/ui.js';
import { api } from '../services/api.js';

interface SearchResult {
  patient_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  similarity: number;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const { searchOpen, setSearchOpen } = useUiStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [searchOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, setSearchOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
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
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSelect = (patientId: number) => {
    setSearchOpen(false);
    navigate(`/patients/${patientId}`);
  };

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 modal-backdrop"
        onClick={() => setSearchOpen(false)}
      />

      {/* Search panel */}
      <div className="relative w-full max-w-lg mx-4 modal-container p-0 overflow-hidden modal-content">
        {/* Input */}
        <div className="flex items-center px-4 border-b border-light-border/20 dark:border-dark-border/20">
          <Search className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search patients by name or MRN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-3 py-4 bg-transparent border-none outline-none text-light-text-primary dark:text-dark-text-primary placeholder-light-text-secondary dark:placeholder-dark-text-secondary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-light-secondary dark:hover:bg-dark-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {loading && (
            <div className="p-4 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Searching...
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul>
              {results.map((r) => (
                <li key={r.patient_id}>
                  <button
                    onClick={() => handleSelect(r.patient_id)}
                    className="w-full text-left px-4 py-3 hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {r.last_name}, {r.first_name}
                      </p>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        MRN: {r.mrn} &middot; DOB:{' '}
                        {new Date(r.date_of_birth).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="p-4 text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
              No patients found
            </div>
          )}

          {!query.trim() && (
            <div className="p-4 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Type to search patients...
              <kbd className="ml-2 px-1.5 py-0.5 rounded bg-light-secondary dark:bg-dark-secondary">
                Esc
              </kbd>{' '}
              to close
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
