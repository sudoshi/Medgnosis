// =============================================================================
// Dashboard — Recent Activity & Abigail Chat (Section 5)
// =============================================================================

import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Send } from 'lucide-react';
import { api } from '../../services/api.js';
import { relativeTime } from '../../utils/time.js';
import {
  PatientAvatar,
  getInitials,
} from '../../components/PatientAvatar.js';
import type { DashboardResponse } from './types.js';

// ─── AbbyChat ────────────────────────────────────────────────────────────────

function AbbyChat({ greeting }: { greeting: string }) {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'abby'; text: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: sendChat, isPending } = useMutation({
    mutationFn: (msg: string) =>
      api.post<{ response: string }>('/insights/chat', { message: msg }),
    onSuccess: (res) => {
      const reply = (res as { data?: { response?: string } }).data?.response ?? 'I\'m processing your request...';
      setChat((prev) => [...prev, { role: 'abby', text: reply }]);
    },
    onError: () => {
      setChat((prev) => [...prev, { role: 'abby', text: 'I\'m unavailable right now. Please try again later.' }]);
    },
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isPending) return;
    setChat((prev) => [...prev, { role: 'user', text: trimmed }]);
    setMessage('');
    sendChat(trimmed);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Greeting or chat history */}
      {chat.length === 0 ? (
        <div className="flex flex-col items-center text-center py-2">
          <div
            className="w-12 h-12 rounded-full bg-violet/10 border border-violet/20 flex items-center justify-center mb-3"
            style={{ boxShadow: '0 0 20px rgba(139,92,246,0.12)' }}
          >
            <Sparkles size={20} strokeWidth={1.5} className="text-violet" />
          </div>
          <p className="text-sm text-dim leading-snug">{greeting}</p>
          <p className="text-xs text-ghost mt-1.5 leading-relaxed">
            Ask me anything about your patients or care gaps.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
          {chat.map((msg, i) => (
            <div
              key={i}
              className={[
                'rounded-card px-3 py-2 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-teal/10 text-teal ml-4'
                  : 'bg-s1 text-dim mr-4',
              ].join(' ')}
            >
              {msg.text}
            </div>
          ))}
          {isPending && (
            <div className="bg-s1 rounded-card px-3 py-2 text-xs text-ghost mr-4 flex items-center gap-1.5">
              <span className="w-3 h-3 border border-ghost border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Thinking...
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask Abigail..."
          rows={2}
          className="input-field flex-1 resize-none text-xs"
          aria-label="Message Abigail"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || isPending}
          className="p-2 rounded-card bg-violet/15 text-violet hover:bg-violet/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50"
          aria-label="Send message"
        >
          <Send size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ─── RecentActivitySection ───────────────────────────────────────────────────

interface RecentActivitySectionProps {
  recentEncounters: DashboardResponse['analytics']['recent_encounters'];
  abbyGreeting: string;
}

export function RecentActivitySection({ recentEncounters, abbyGreeting }: RecentActivitySectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 animate-fade-up stagger-6">

      {/* Recent Encounters */}
      <div className="surface">
        <h3 className="text-base font-semibold text-bright mb-4">Recent Encounters</h3>
        {recentEncounters.length > 0 ? (
          <div className="divide-y divide-edge/15">
            {recentEncounters.map((enc) => {
              return (
                <Link
                  key={enc.id}
                  to={`/patients/${enc.id}`}
                  className={[
                    'flex items-center gap-3 py-3 first:pt-0 last:pb-0',
                    'hover:bg-s1 -mx-[var(--padding-panel)] px-[var(--padding-panel)]',
                    'transition-colors duration-100 group',
                  ].join(' ')}
                >
                  <PatientAvatar
                    initials={getInitials(enc.patient_name)}
                    seed={enc.patient_name}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bright group-hover:text-teal transition-colors truncate">{enc.patient_name}</p>
                    <p className="text-xs text-dim mt-0.5">{enc.type}</p>
                  </div>
                  <span className="font-data text-xs text-ghost whitespace-nowrap flex-shrink-0">
                    {relativeTime(enc.date)}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-state py-10">
            <p className="empty-state-title">No recent encounters</p>
            <p className="empty-state-desc">Patient encounters will appear here as they are recorded</p>
          </div>
        )}
      </div>

      {/* Abigail AI Chat */}
      <div
        className="surface"
        style={{ borderTopColor: 'rgba(139,92,246,0.45)', borderTopWidth: '2px' }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <Sparkles size={15} strokeWidth={1.5} className="text-violet" />
          <h3 className="text-base font-semibold text-bright">Abigail</h3>
          <span className="badge-dim text-xs">AI</span>
        </div>
        <AbbyChat greeting={abbyGreeting} />
      </div>

    </div>
  );
}
