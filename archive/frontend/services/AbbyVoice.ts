import { VOICE_CONFIG } from "@/config/voice";

import { abbyAnalytics } from "./AbbyAnalytics";
import { abbyCache } from "./AbbyCache";


interface VoiceOptions {
  emotion?: string;
  rate?: number;
}

class AbbyVoice {
  private static instance: AbbyVoice;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  private constructor() {
    if (typeof window !== "undefined") {
      this.initAudioContext();
    }
  }

  public static getInstance(): AbbyVoice {
    if (!AbbyVoice.instance) {
      AbbyVoice.instance = new AbbyVoice();
    }

    return AbbyVoice.instance;
  }

  private async initAudioContext() {
    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.setVolume(VOICE_CONFIG.audio.volume);
      abbyAnalytics.trackEvent("voice_system_initialized", {});
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
      abbyAnalytics.trackError(
        "voice_init_error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  private setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  private async synthesizeSpeech(
    text: string,
    options: VoiceOptions = {},
  ): Promise<ArrayBuffer> {
    const apiKey = VOICE_CONFIG.elevenlabs.apiKey;
    const voiceId = VOICE_CONFIG.elevenlabs.voiceId;

    if (!apiKey || !voiceId) {
      throw new Error("ElevenLabs API key or voice ID not configured");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: VOICE_CONFIG.elevenlabs.model,
          voice_settings: {
            stability: VOICE_CONFIG.elevenlabs.stability,
            similarity_boost: VOICE_CONFIG.elevenlabs.similarityBoost,
            style: options.emotion || 0.5,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();

      throw new Error(`ElevenLabs API error: ${error}`);
    }

    return response.arrayBuffer();
  }

  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Stop any currently playing audio
        if (this.currentAudio) {
          this.currentAudio.pause();
          this.currentAudio = null;
        }

        // Create blob and audio element
        const blob = new Blob([audioData], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        // Connect to audio context for volume control
        if (this.audioContext && this.gainNode) {
          const source = this.audioContext.createMediaElementSource(audio);

          source.connect(this.gainNode);
        }

        // Set up event handlers
        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          reject(error);
        };

        // Start playback
        this.currentAudio = audio;
        audio.play().catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  public async speak(text: string, options: VoiceOptions = {}): Promise<void> {
    try {
      const startTime = performance.now();

      // Check cache first
      const cached = abbyCache.getVoiceResponse(text);
      let audioData: ArrayBuffer;

      if (cached) {
        audioData = cached.audio;
        abbyAnalytics.trackEvent("voice_cache_hit", {
          textLength: text.length,
          duration: cached.metadata.duration,
        });
      } else {
        // Synthesize new speech
        audioData = await this.synthesizeSpeech(text, options);

        // Cache the result
        abbyCache.setVoiceResponse(text, audioData, {
          duration: 0, // We don't know the actual duration yet
          emotion: options.emotion,
          rate: options.rate,
          size: audioData.byteLength,
        });

        abbyAnalytics.trackEvent("voice_synthesized", {
          textLength: text.length,
          options,
        });
      }

      // Play the audio
      await this.playAudio(audioData);

      // Track performance
      const duration = performance.now() - startTime;

      abbyAnalytics.trackVoiceSynthesis(duration);
    } catch (error) {
      console.error("Speech synthesis error:", error);
      abbyAnalytics.trackError(
        "voice_synthesis_error",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  public stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  public isPlaying(): boolean {
    return this.currentAudio !== null;
  }
}

// Export singleton instance
export const abbyVoice = AbbyVoice.getInstance();
