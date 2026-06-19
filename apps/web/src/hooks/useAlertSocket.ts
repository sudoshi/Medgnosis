// =============================================================================
// Medgnosis Web — WebSocket hook for real-time alerts
// =============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_EVENTS } from '@medgnosis/shared';
import { useAuthStore } from '../stores/auth.js';
import { useWsStore } from '../stores/ws.js';
import { announce } from '../stores/announcer.js';

type AlertMessage = {
  type: string;
  payload: Record<string, unknown>;
};

const REALTIME_ALERTS_ENABLED = import.meta.env.VITE_REALTIME_ALERTS_ENABLED !== 'false';

export function useAlertSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const queryClient = useQueryClient();
  const { tokens, isAuthenticated } = useAuthStore();
  const setStatus = useWsStore((s) => s.setStatus);

  const connect = useCallback(() => {
    if (!REALTIME_ALERTS_ENABLED) {
      setStatus('disconnected');
      return;
    }

    if (!isAuthenticated || !tokens?.access_token) return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${tokens.access_token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('reconnecting');

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: AlertMessage = JSON.parse(event.data);
        switch (msg.type) {
          case WS_EVENTS.ALERT_CREATED:
          case 'alert:new': {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            // Give screen readers a voice for realtime arrivals (was silent).
            const sev = String(msg.payload?.severity ?? '').toLowerCase();
            const label = String(
              msg.payload?.title ?? msg.payload?.message ?? msg.payload?.alert_type ?? 'New clinical alert',
            );
            announce(sev ? `New ${sev} alert: ${label}` : `New alert: ${label}`, {
              assertive: sev === 'critical' || sev === 'high',
            });
            break;
          }
          case WS_EVENTS.CARE_GAP_CLOSED:
          case 'care-gap:closed':
            queryClient.invalidateQueries({ queryKey: ['care-gaps'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            break;
          default:
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!shouldReconnectRef.current) {
        setStatus('disconnected');
        return;
      }
      setStatus('reconnecting');
      reconnectTimerRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      setStatus('disconnected');
      ws.close();
    };
  }, [isAuthenticated, tokens?.access_token, queryClient, setStatus]);

  useEffect(() => {
    if (!REALTIME_ALERTS_ENABLED) {
      shouldReconnectRef.current = false;
      wsRef.current?.close();
      setStatus('disconnected');
      return undefined;
    }

    shouldReconnectRef.current = isAuthenticated && Boolean(tokens?.access_token);
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      setStatus('disconnected');
    };
  }, [connect, isAuthenticated, setStatus, tokens?.access_token]);
}
