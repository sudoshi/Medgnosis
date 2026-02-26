// =============================================================================
// Medgnosis Web — WebSocket hook for real-time alerts
// =============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.js';
import { useWsStore } from '../stores/ws.js';

type AlertMessage = {
  type: string;
  payload: Record<string, unknown>;
};

export function useAlertSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { tokens, isAuthenticated } = useAuthStore();
  const setStatus = useWsStore((s) => s.setStatus);

  const connect = useCallback(() => {
    if (!isAuthenticated || !tokens?.access_token) return;

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
          case 'alert:new':
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            break;
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
      setStatus('reconnecting');
      // Reconnect after 5 seconds
      setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      setStatus('disconnected');
      ws.close();
    };
  }, [isAuthenticated, tokens?.access_token, queryClient, setStatus]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      setStatus('disconnected');
    };
  }, [connect, setStatus]);
}
