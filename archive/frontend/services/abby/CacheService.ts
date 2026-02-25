import { CacheEntry } from './types';

export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheEntry<any>>;
  private readonly DEFAULT_TTL = 3600000; // 1 hour in milliseconds
  private readonly MAX_CACHE_SIZE = 100;

  private constructor() {
    this.cache = new Map();
    this.startCleanupInterval();
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private startCleanupInterval() {
    setInterval(() => this.cleanup(), 300000); // Clean up every 5 minutes
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private generateKey(key: string): string {
    return typeof key === 'string' ? key : JSON.stringify(key);
  }

  async set<T>(
    key: string,
    value: T,
    ttl = this.DEFAULT_TTL
  ): Promise<void> {
    const cacheKey = this.generateKey(key);

    // If cache is full, remove oldest entry
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())
        [0][0];
      this.cache.delete(oldestKey);
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: new Date(),
      ttl,
    };

    this.cache.set(cacheKey, entry);
  }

  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey) as CacheEntry<T>;

    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.value;
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl = this.DEFAULT_TTL
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  delete(key: string): void {
    const cacheKey = this.generateKey(key);
    this.cache.delete(cacheKey);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  entries(): Array<[string, CacheEntry<any>]> {
    return Array.from(this.cache.entries());
  }
}

export const cacheService = CacheService.getInstance();
