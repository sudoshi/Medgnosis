export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

import { ErrorHandlingService } from './abby/ErrorHandlingService';
import { SecurityService } from './abby/SecurityService';
import { CacheService } from './abby/CacheService';
import { QueueService } from './abby/QueueService';
import { StateManagementService } from './abby/StateManagementService';
import { Message } from './abby/types';

export class OllamaService {
  private baseUrl: string;
  private security: SecurityService;
  private cache: CacheService;
  private queue: QueueService;
  private state: StateManagementService;
  private readonly CACHE_TTL = 3600000; // 1 hour

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.security = SecurityService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
    this.state = StateManagementService.getInstance();
  }

  private generateCacheKey(message: string, model: string): string {
    const conversationContext = this.state.getState().activeSession?.conversation?.messages
      .slice(-5) // Last 5 messages for context
      .map(m => `${m.role}:${m.content}`)
      .join('|');
    
    return this.security.hashString(`${model}:${conversationContext}:${message}`);
  }

  async chat(message: string, model = 'mistral:7b-instruct') {
    try {
      // Rate limit check
      this.security.checkRateLimit();

      // Input validation and sanitization
      const sanitizedMessage = this.security.sanitizeInput(message);
      
      // Generate cache key based on conversation context
      const cacheKey = this.generateCacheKey(sanitizedMessage, model);

      // Try to get from cache first
      const cachedResponse = await this.cache.get<ReadableStream>(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Queue the request
      return await this.queue.enqueue(
        async () => {
          const response = await ErrorHandlingService.withRetry(
            async () => {
              const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model,
                  messages: this.state.getState().activeSession?.conversation?.messages || [{
                    role: 'user',
                    content: sanitizedMessage,
                  }],
                  stream: true,
                }),
              });

              if (!res.ok) {
                const errorText = await res.text();
                throw ErrorHandlingService.createError(
                  `Ollama API error: ${res.status} - ${errorText}`,
                  'API_ERROR',
                  true
                );
              }

              if (!res.body) {
                throw ErrorHandlingService.createError(
                  'No response body received from Ollama',
                  'API_ERROR',
                  true
                );
              }

              // Cache the response
              await this.cache.set(cacheKey, res.body, this.CACHE_TTL);

              return res.body;
            },
            'ollama-chat'
          );

          return response;
        },
        1 // Priority 1 for chat requests
      );
    } catch (error) {
      // Log error and update state
      console.error('Error in chat:', error);
      this.state.setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  addAssistantResponse(content: string) {
    const session = this.state.getState().activeSession;
    if (!session) return;

    const conversation = session.conversation || {
      id: crypto.randomUUID(),
      messages: [],
      startTime: new Date(),
    };

    conversation.messages.push({
      role: 'assistant',
      content,
      timestamp: new Date(),
    });

    this.state.updateSession(session.id, conversation);
  }

  clearHistory() {
    const session = this.state.getState().activeSession;
    if (session) {
      this.state.endSession(session.id);
    }
  }
}

export const ollamaService = new OllamaService();

