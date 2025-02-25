import { AbbyState, UserPreferences, VoiceSettings, Session, Conversation } from './types';
import { ErrorHandlingService } from './ErrorHandlingService';

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  wakeWord: ['hey abby', 'hey abbey'],
  language: 'en-US',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  fontSize: 16,
  notifications: true,
  voiceSettings: DEFAULT_VOICE_SETTINGS,
};

export class StateManagementService {
  private static instance: StateManagementService;
  private state: AbbyState;
  private subscribers: Set<(state: AbbyState) => void>;
  private readonly STORAGE_KEY = 'abby_state';

  private constructor() {
    this.subscribers = new Set();
    this.state = this.loadState();
  }

  static getInstance(): StateManagementService {
    if (!StateManagementService.instance) {
      StateManagementService.instance = new StateManagementService();
    }
    return StateManagementService.instance;
  }

  private loadState(): AbbyState {
    try {
      const savedState = localStorage.getItem(this.STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        return {
          ...parsed,
          conversations: parsed.conversations.map((conv: any) => ({
            ...conv,
            startTime: new Date(conv.startTime),
            endTime: conv.endTime ? new Date(conv.endTime) : undefined,
            messages: conv.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            })),
          })),
        };
      }
    } catch (error) {
      console.error('Error loading state:', error);
    }

    return {
      conversations: [],
      preferences: DEFAULT_PREFERENCES,
    };
  }

  private saveState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  private notifySubscribers() {
    this.subscribers.forEach(subscriber => subscriber(this.state));
  }

  subscribe(callback: (state: AbbyState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getState(): AbbyState {
    return this.state;
  }

  startNewSession(): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      startTime: new Date(),
      lastActive: new Date(),
    };

    this.state = {
      ...this.state,
      activeSession: session,
    };

    this.saveState();
    this.notifySubscribers();
    return session;
  }

  updateSession(sessionId: string, conversation?: Conversation) {
    if (this.state.activeSession?.id !== sessionId) return;

    this.state = {
      ...this.state,
      activeSession: {
        ...this.state.activeSession,
        lastActive: new Date(),
        conversation,
      },
    };

    this.saveState();
    this.notifySubscribers();
  }

  endSession(sessionId: string) {
    if (this.state.activeSession?.id !== sessionId) return;

    if (this.state.activeSession.conversation) {
      this.state.conversations.push({
        ...this.state.activeSession.conversation,
        endTime: new Date(),
      });
    }

    this.state = {
      ...this.state,
      activeSession: undefined,
    };

    this.saveState();
    this.notifySubscribers();
  }

  updatePreferences(preferences: Partial<UserPreferences>) {
    this.state = {
      ...this.state,
      preferences: {
        ...this.state.preferences,
        ...preferences,
      },
    };

    this.saveState();
    this.notifySubscribers();
  }

  clearConversations() {
    this.state = {
      ...this.state,
      conversations: [],
    };

    this.saveState();
    this.notifySubscribers();
  }

  setError(error: Error) {
    this.state = {
      ...this.state,
      error: ErrorHandlingService.createError(
        error.message,
        'STATE_ERROR',
        false,
        error
      ),
    };

    this.notifySubscribers();
  }

  clearError() {
    this.state = {
      ...this.state,
      error: undefined,
    };

    this.notifySubscribers();
  }
}

export const stateManager = StateManagementService.getInstance();
