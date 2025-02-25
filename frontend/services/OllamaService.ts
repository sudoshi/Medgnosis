import { ErrorHandlingService } from './abby/ErrorHandlingService';
import { SecurityService } from './abby/SecurityService';
import { CacheService } from './abby/CacheService';
import { QueueService } from './abby/QueueService';
import { StateManagementService } from './abby/StateManagementService';
import { Message } from './abby/types';

export interface ChatMessage extends Message {}

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

  async chat(message: string, model: string = 'gemma:latest'): Promise<ReadableStream<Uint8Array>> {
    console.log('OllamaService.chat called with message:', message, 'model:', model);
    
    // Sanitize the message
    const sanitizedMessage = message.trim();
    console.log('Sanitized message:', sanitizedMessage);
    
    // Generate a cache key
    const cacheKey = this.generateCacheKey(sanitizedMessage, model);
    console.log('Cache key:', cacheKey);
    
    // Check if we have a cached response
    const cachedResponse = await this.cache.get<ReadableStream>(cacheKey);
    console.log('Cached response:', cachedResponse);
    
    if (cachedResponse) {
      console.log('Using cached response');
      return cachedResponse;
    }
    
    // Queue the request
    return await this.queue.enqueue(
      async () => {
        try {
          console.log('Making request to Ollama API:', `${this.baseUrl}/api/generate`);
          console.log('Request body:', JSON.stringify({
            model,
            prompt: sanitizedMessage,
            stream: true,
          }));
          
          const res = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              prompt: sanitizedMessage,
              stream: true,
            }),
          });
          
          console.log('Response status:', res.status);
          console.log('Response headers:', Object.fromEntries([...res.headers.entries()]));
          
          if (!res.ok) {
            const errorText = await res.text();
            console.error('Error response from Ollama API:', errorText);
            throw ErrorHandlingService.createError(
              `Ollama API error: ${res.status} - ${errorText}`,
              'API_ERROR',
              true
            );
          }
          
          if (!res.body) {
            console.error('No response body from Ollama API');
            throw ErrorHandlingService.createError(
              'No response body received from Ollama',
              'API_ERROR',
              true
            );
          }
          
          console.log('Ollama API response headers:', {
            status: res.status,
            contentType: res.headers.get('Content-Type'),
            headers: Object.fromEntries([...res.headers.entries()])
          });
          
          // Create a simpler stream that directly passes the response text
          console.log('Creating readable stream...');
          const stream = new ReadableStream({
            async start(controller) {
              console.log('Stream start called, getting reader...');
              const reader = res.body.getReader();
              console.log('Got reader:', reader);
              const textDecoder = new TextDecoder();
              let buffer = '';
              
              try {
                console.log('Starting to read from response body...');
                while (true) {
                  console.log('Reading chunk from response body...');
                  const { done, value } = await reader.read();
                  console.log('Read result:', { done, valueExists: !!value, valueLength: value ? value.length : 0 });
                  
                  if (done) {
                    console.log('Response body done, closing stream');
                    controller.close();
                    break;
                  }
                  
                  // Decode the chunk
                  const chunkText = textDecoder.decode(value, { stream: true });
                  console.log('Raw chunk:', chunkText);
                  buffer += chunkText;
                  
                  // Process complete JSON objects
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || ''; // Keep the last incomplete line
                  console.log('Processing', lines.length, 'lines, remaining buffer:', buffer);
                  
                  for (const line of lines) {
                    if (!line.trim()) {
                      console.log('Skipping empty line');
                      continue;
                    }
                    
                    try {
                      console.log('Parsing JSON:', line);
                      const jsonChunk = JSON.parse(line);
                      console.log('Parsed chunk:', jsonChunk);
                      
                      if (jsonChunk.response) {
                        // Send the response text directly
                        console.log('Enqueueing response:', jsonChunk.response);
                        const encoder = new TextEncoder();
                        controller.enqueue(encoder.encode(jsonChunk.response));
                      } else {
                        console.log('No response field in chunk');
                      }
                    } catch (e) {
                      console.error('Error parsing JSON:', e, line);
                    }
                  }
                }
              } catch (error) {
                console.error('Stream processing error:', error);
                controller.error(error);
              }
            }
          });
          
          console.log('Stream created, caching and returning...');
          // Cache the response
          await this.cache.set(cacheKey, stream, this.CACHE_TTL);
          
          return stream;
        } catch (error) {
          // Log error and update state
          console.error('Error in chat:', error);
          this.state.setError(error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      },
      1 // Priority 1 for chat requests
    );
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
