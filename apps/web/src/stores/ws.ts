// =============================================================================
// Medgnosis Web — WebSocket connection state store (Zustand)
// =============================================================================

import { create } from 'zustand';

export type WsStatus = 'connected' | 'reconnecting' | 'disconnected';

interface WsState {
  status: WsStatus;
  setStatus: (s: WsStatus) => void;
}

export const useWsStore = create<WsState>()((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}));
