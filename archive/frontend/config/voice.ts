export const VOICE_CONFIG = {
  // Wake word settings
  wakeWord: {
    keyword: "hey abby",
    sensitivity: 0.7, // 0.0 to 1.0
    requireConfirmation: false,
  },

  // Voice feedback settings
  audio: {
    enabled: true,
    volume: 0.8,
    sounds: {
      activation: "/sounds/activation.mp3",
      processing: "/sounds/processing.mp3",
      error: "/sounds/error.mp3",
    },
  },

  // ElevenLabs settings
  elevenlabs: {
    apiKey: process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY,
    voiceId: process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID,
    model: "eleven_monolingual_v1",
    stability: 0.5,
    similarityBoost: 0.75,
  },

  // Voice recognition settings
  recognition: {
    continuous: true,
    interimResults: true,
    language: "en-US",
  },

  // Response templates
  responses: {
    greeting: "How can I help?",
    processing: "Let me check that for you...",
    error: "I'm sorry, I couldn't understand that. Could you please try again?",
    noPermission:
      "I'll need microphone access to help you with voice commands.",
  },

  // Command mappings
  commands: {
    navigation: {
      "show patients": "/patients",
      "open dashboard": "/dashboard",
      "show care gaps": "/care-lists",
      "show measures": "/measures",
    },
    actions: {
      "high risk patients": {
        action: "SHOW_HIGH_RISK",
        response: "Here are your high-risk patients...",
      },
      "care gaps summary": {
        action: "SHOW_CARE_GAPS",
        response: "Displaying care gaps summary...",
      },
    },
  },
};

// Voice command types
export type CommandAction = keyof typeof VOICE_CONFIG.commands.actions;
export type NavigationCommand = keyof typeof VOICE_CONFIG.commands.navigation;

// Voice state types
export interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
  transcript: string;
}

// Voice command result
export interface CommandResult {
  success: boolean;
  action?: string;
  response?: string;
  error?: string;
}
