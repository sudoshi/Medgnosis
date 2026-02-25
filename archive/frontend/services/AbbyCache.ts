interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  metadata?: Record<string, any>;
}

interface CacheConfig {
  defaultTTL: number; // Time to live in milliseconds
  maxEntries: number;
  voiceCacheDuration: number;
  responseCacheDuration: number;
  maxVoiceCacheSize: number; // Maximum size in bytes for voice cache
}

interface VoiceCacheMetadata {
  duration: number;
  emotion?: string;
  rate?: number;
  size: number;
}

class AbbyCache {
  private static instance: AbbyCache;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: CacheConfig;
  private totalVoiceCacheSize: number = 0;

  private constructor() {
    this.config = {
      defaultTTL: Number(process.env.NEXT_PUBLIC_CACHE_DURATION) || 3600 * 1000, // 1 hour
      maxEntries: 1000,
      voiceCacheDuration: 24 * 3600 * 1000, // 24 hours for voice
      responseCacheDuration: 3600 * 1000, // 1 hour for responses
      maxVoiceCacheSize: 100 * 1024 * 1024, // 100MB max for voice cache
    };

    // Start periodic cleanup
    if (typeof window !== "undefined") {
      setInterval(() => this.cleanup(), 5 * 60 * 1000); // Clean every 5 minutes
    }
  }

  public static getInstance(): AbbyCache {
    if (!AbbyCache.instance) {
      AbbyCache.instance = new AbbyCache();
    }

    return AbbyCache.instance;
  }

  private getKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private cleanup(): void {
    const now = Date.now();
    let voiceCacheSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        continue;
      }

      // Track voice cache size
      if (key.startsWith("voice:") && entry.metadata?.size) {
        voiceCacheSize += entry.metadata.size;
      }
    }

    this.totalVoiceCacheSize = voiceCacheSize;
  }

  private enforceVoiceCacheLimit(newEntrySize: number): void {
    if (
      this.totalVoiceCacheSize + newEntrySize <=
      this.config.maxVoiceCacheSize
    ) {
      return;
    }

    // Get all voice entries sorted by last access time
    const voiceEntries = Array.from(this.cache.entries())
      .filter(([key]) => key.startsWith("voice:"))
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest entries until we have enough space
    for (const [key, entry] of voiceEntries) {
      if (
        this.totalVoiceCacheSize + newEntrySize <=
        this.config.maxVoiceCacheSize
      ) {
        break;
      }
      this.totalVoiceCacheSize -= (entry.metadata?.size as number) || 0;
      this.cache.delete(key);
    }
  }

  public set<T>(
    key: string,
    data: T,
    options?: {
      ttl?: number;
      namespace?: string;
      metadata?: Record<string, any>;
    },
  ): void {
    const fullKey = this.getKey(key, options?.namespace);
    const now = Date.now();

    // Handle voice cache size limits
    if (options?.namespace === "voice" && options.metadata?.size) {
      this.enforceVoiceCacheLimit(options.metadata.size);
      this.totalVoiceCacheSize += options.metadata.size;
    }

    // Ensure we don't exceed max entries
    if (this.cache.size >= this.config.maxEntries) {
      // Remove oldest entry
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      )[0][0];

      const oldEntry = this.cache.get(oldestKey);

      if (oldEntry?.metadata?.size) {
        this.totalVoiceCacheSize -= oldEntry.metadata.size;
      }

      this.cache.delete(oldestKey);
    }

    this.cache.set(fullKey, {
      data,
      timestamp: now,
      expiresAt: now + (options?.ttl || this.config.defaultTTL),
      metadata: options?.metadata,
    });
  }

  public get<T>(
    key: string,
    options?: {
      namespace?: string;
      defaultValue?: T;
      updateTimestamp?: boolean;
    },
  ): T | undefined {
    const fullKey = this.getKey(key, options?.namespace);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return options?.defaultValue;
    }

    if (entry.expiresAt <= Date.now()) {
      if (entry.metadata?.size) {
        this.totalVoiceCacheSize -= entry.metadata.size;
      }
      this.cache.delete(fullKey);

      return options?.defaultValue;
    }

    // Update access timestamp if requested
    if (options?.updateTimestamp) {
      entry.timestamp = Date.now();
    }

    return entry.data as T;
  }

  public async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: {
      ttl?: number;
      namespace?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<T> {
    const cached = this.get<T>(key, { namespace: options?.namespace });

    if (cached !== undefined) {
      return cached;
    }

    const data = await fetchFn();

    this.set(key, data, options);

    return data;
  }

  public has(key: string, namespace?: string): boolean {
    const fullKey = this.getKey(key, namespace);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return false;
    }

    if (entry.expiresAt <= Date.now()) {
      if (entry.metadata?.size) {
        this.totalVoiceCacheSize -= entry.metadata.size;
      }
      this.cache.delete(fullKey);

      return false;
    }

    return true;
  }

  public delete(key: string, namespace?: string): boolean {
    const fullKey = this.getKey(key, namespace);
    const entry = this.cache.get(fullKey);

    if (entry?.metadata?.size) {
      this.totalVoiceCacheSize -= entry.metadata.size;
    }

    return this.cache.delete(fullKey);
  }

  public clear(namespace?: string): void {
    if (namespace) {
      // Only clear entries in the specified namespace
      for (const [key, entry] of this.cache.entries()) {
        if (key.startsWith(`${namespace}:`)) {
          if (entry.metadata?.size) {
            this.totalVoiceCacheSize -= entry.metadata.size;
          }
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.totalVoiceCacheSize = 0;
    }
  }

  // Voice-specific caching
  public setVoiceResponse(
    text: string,
    audioData: ArrayBuffer,
    metadata: VoiceCacheMetadata,
  ): void {
    this.set(text, audioData, {
      namespace: "voice",
      ttl: this.config.voiceCacheDuration,
      metadata,
    });
  }

  public getVoiceResponse(
    text: string,
  ): { audio: ArrayBuffer; metadata: VoiceCacheMetadata } | undefined {
    const entry = this.get<ArrayBuffer>(text, {
      namespace: "voice",
      updateTimestamp: true,
    });

    if (!entry || !this.cache.get(this.getKey(text, "voice"))?.metadata) {
      return undefined;
    }

    return {
      audio: entry,
      metadata: this.cache.get(this.getKey(text, "voice"))!
        .metadata as VoiceCacheMetadata,
    };
  }

  // AI response caching
  public setAIResponse(
    input: string,
    response: string,
    context?: Record<string, any>,
  ): void {
    const key = this.generateResponseKey(input, context);

    this.set(key, response, {
      namespace: "ai-responses",
      ttl: this.config.responseCacheDuration,
      metadata: { context },
    });
  }

  public getAIResponse(
    input: string,
    context?: Record<string, any>,
  ): string | undefined {
    const key = this.generateResponseKey(input, context);

    return this.get(key, {
      namespace: "ai-responses",
      updateTimestamp: true,
    });
  }

  private generateResponseKey(
    input: string,
    context?: Record<string, any>,
  ): string {
    // Create a deterministic key from input and context
    const contextStr = context ? JSON.stringify(context) : "";

    return `${input}-${contextStr}`;
  }

  // Configuration
  public updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getStats(): {
    totalEntries: number;
    voiceEntries: number;
    aiResponseEntries: number;
    voiceCacheSize: number;
    memoryUsage: number;
  } {
    let voiceEntries = 0;
    let aiResponseEntries = 0;
    let memoryUsage = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith("voice:")) voiceEntries++;
      if (key.startsWith("ai-responses:")) aiResponseEntries++;
      memoryUsage += JSON.stringify(entry).length * 2; // Rough estimate in bytes
    }

    return {
      totalEntries: this.cache.size,
      voiceEntries,
      aiResponseEntries,
      voiceCacheSize: this.totalVoiceCacheSize,
      memoryUsage,
    };
  }
}

// Export singleton instance
export const abbyCache = AbbyCache.getInstance();
