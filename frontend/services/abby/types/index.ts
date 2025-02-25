export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  messages: Message[];
  startTime: Date;
  endTime?: Date;
}

export interface VoiceSettings {
  enabled: boolean;
  wakeWord: string[];
  language: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  fontSize: number;
  notifications: boolean;
  voiceSettings: VoiceSettings;
}

export interface Session {
  id: string;
  startTime: Date;
  lastActive: Date;
  conversation?: Conversation;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: Date;
  ttl: number;
}

export interface QueuedTask<T> {
  id: string;
  task: () => Promise<T>;
  priority: number;
  timestamp: Date;
  timeout?: number;
}

export interface AbbyError {
  code: string;
  message: string;
  retry?: boolean;
  original?: unknown;
}

export interface AbbyState {
  conversations: Conversation[];
  preferences: UserPreferences;
  activeSession?: Session;
  error?: AbbyError;
}
