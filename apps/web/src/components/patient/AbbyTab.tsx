// =============================================================================
// Medgnosis — Abby AI Chat Tab (Patient-Context Clinical Assistant)
// Full chat interface for the PatientDetailPage tab system
// Powered by Ollama/MedGemma with injected EHR context
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useAiChat } from '../../hooks/useApi.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AbbyTabProps {
  patientId: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'abby';
  content: string;
  timestamp: Date;
}

// ─── Quick-action Suggestions ───────────────────────────────────────────────

const SUGGESTIONS = [
  'Summarize care gaps',
  'Drug interaction check',
  'Quality measures',
  'Risk assessment',
];

// ─── Component ──────────────────────────────────────────────────────────────

export function AbbyTab({ patientId }: AbbyTabProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);

  const { mutate: sendChat, isPending } = useAiChat();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPending]);

  // Fetch initial welcome message + context on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    sendChat(
      {
        message:
          'Please introduce yourself briefly and summarize key clinical findings for this patient in 2-3 sentences. Mention the number of active conditions, medications, and any open care gaps.',
        patient_id: Number(patientId),
      },
      {
        onSuccess: (res) => {
          const data = (res as unknown as Record<string, unknown>).data as {
            response?: string;
            context_summary?: string;
          } | undefined;

          if (data?.context_summary) {
            setContextSummary(data.context_summary);
          }
          setMessages([
            {
              id: crypto.randomUUID(),
              role: 'abby',
              content:
                data?.response ??
                "Hello! I'm Abby, your AI clinical assistant. I'm reviewing this patient's chart.",
              timestamp: new Date(),
            },
          ]);
          setInitializing(false);
        },
        onError: () => {
          setMessages([
            {
              id: crypto.randomUUID(),
              role: 'abby',
              content:
                "I'm having trouble connecting right now. Please ensure AI insights are enabled and try again.",
              timestamp: new Date(),
            },
          ]);
          setInitializing(false);
        },
      },
    );
  }, [patientId, sendChat]);

  // Build history array for API
  const buildHistory = (): Array<{
    role: 'user' | 'assistant';
    content: string;
  }> => {
    return messages.map((m) => ({
      role: m.role === 'abby' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));
  };

  const handleSend = (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isPending) return;

    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);

    // Focus textarea after send
    setTimeout(() => textareaRef.current?.focus(), 50);

    sendChat(
      {
        message: trimmed,
        patient_id: Number(patientId),
        history: buildHistory(),
      },
      {
        onSuccess: (res) => {
          const data = (res as unknown as Record<string, unknown>).data as {
            response?: string;
          } | undefined;

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'abby',
              content:
                data?.response ??
                "I couldn't process that request. Please try again.",
              timestamp: new Date(),
            },
          ]);
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'abby',
              content:
                "I'm unavailable right now. Please try again later.",
              timestamp: new Date(),
            },
          ]);
        },
      },
    );
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ── Loading State ────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div
        className="surface overflow-hidden"
        style={{ borderTop: '2px solid rgba(139,92,246,0.45)' }}
      >
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-14 h-14 rounded-full bg-violet/10 border border-violet/20 flex items-center justify-center">
            <Sparkles
              size={24}
              strokeWidth={1.5}
              className="text-2xl text-violet animate-pulse"
            />
          </div>
          <div className="text-center">
            <p className="text-sm text-dim font-ui">
              Abby is reviewing the chart...
            </p>
            <p className="text-xs text-ghost mt-1">
              Gathering conditions, medications, vitals, and care gaps
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet/40 animate-pulse" />
            <span
              className="w-2 h-2 rounded-full bg-violet/40 animate-pulse"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2 h-2 rounded-full bg-violet/40 animate-pulse"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Main Chat UI ─────────────────────────────────────────────────────────
  return (
    <div
      className="surface overflow-hidden flex flex-col"
      style={{
        borderTop: '2px solid rgba(139,92,246,0.45)',
        minHeight: '500px',
        maxHeight: 'calc(100vh - 20rem)',
      }}
    >
      {/* Context Summary Panel */}
      {contextSummary && (
        <div className="border-b border-edge/20">
          <button
            onClick={() => setContextCollapsed(!contextCollapsed)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-s1 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-violet" />
              <span className="text-xs font-semibold text-dim font-ui uppercase tracking-wider">
                Patient Clinical Context
              </span>
            </div>
            {contextCollapsed ? (
              <ChevronRight size={14} className="text-ghost" />
            ) : (
              <ChevronDown size={14} className="text-ghost" />
            )}
          </button>

          {!contextCollapsed && (
            <div className="px-4 pb-3 space-y-1 animate-fade-up">
              {contextSummary.split('\n').map((line, i) => {
                const [label, ...rest] = line.split(': ');
                const value = rest.join(': ');
                return (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-ghost font-ui whitespace-nowrap min-w-[120px]">
                      {label}:
                    </span>
                    <span className="text-dim leading-relaxed">{value}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={[
                'rounded-card px-4 py-3 text-sm leading-relaxed max-w-[85%]',
                msg.role === 'user'
                  ? 'bg-teal/10 text-teal ml-8'
                  : 'bg-s1 text-dim mr-8',
              ].join(' ')}
            >
              {msg.role === 'abby' && (
                <Sparkles
                  size={11}
                  strokeWidth={1.5}
                  className="text-violet inline mr-1.5 -mt-0.5"
                />
              )}
              {msg.content}
            </div>
            <span className="text-[10px] text-ghost font-data tabular-nums mt-1 px-1">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {/* Suggestion chips — shown after first welcome message */}
        {showSuggestions && messages.length === 1 && !isPending && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="px-3 py-1.5 rounded-full border border-violet/20 text-xs text-violet
                  hover:bg-violet/10 transition-colors cursor-pointer font-ui"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Thinking indicator */}
        {isPending && (
          <div className="flex items-start">
            <div className="bg-s1 rounded-card px-4 py-3 text-sm text-ghost mr-8 flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-violet/40 border-t-violet rounded-full animate-spin flex-shrink-0" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* AI Disclaimer */}
      <div className="px-4 py-1.5 border-t border-edge/10 flex items-center gap-1.5">
        <AlertCircle size={10} strokeWidth={1.5} className="text-ghost flex-shrink-0" />
        <span className="text-[10px] text-ghost font-ui">
          AI clinical decision support — does not replace clinical judgment
        </span>
      </div>

      {/* Input Area */}
      <div className="border-t border-edge/20 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Abby about this patient..."
            rows={2}
            className="input-field flex-1 resize-none text-sm"
            aria-label="Message Abby"
            disabled={isPending}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isPending}
            className="p-2.5 rounded-card bg-violet/15 text-violet hover:bg-violet/25 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50"
            aria-label="Send message"
          >
            <Send size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
