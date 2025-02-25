import { QueuedTask } from './types';
import { ErrorHandlingService } from './ErrorHandlingService';

export class QueueService {
  private static instance: QueueService;
  private queue: QueuedTask<any>[] = [];
  private processing = false;
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  async enqueue<T>(
    task: () => Promise<T>,
    priority = 0,
    timeout = this.DEFAULT_TIMEOUT
  ): Promise<T> {
    const queuedTask: QueuedTask<T> = {
      id: crypto.randomUUID(),
      task,
      priority,
      timestamp: new Date(),
      timeout,
    };

    // Add task to queue and sort by priority
    this.queue.push(queuedTask);
    this.queue.sort((a, b) => b.priority - a.priority);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    // Return promise that resolves when task is completed
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.findIndex(t => t.id === queuedTask.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error('Task timeout exceeded'));
        }
      }, timeout);

      // Wrap the task to clear timeout and handle errors
      const wrappedTask = async () => {
        try {
          const result = await task();
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      };

      queuedTask.task = wrappedTask;
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue[0];
        await ErrorHandlingService.withRetry(
          async () => {
            await task.task();
            this.queue.shift(); // Remove completed task
          },
          'queue-processing'
        );
      }
    } catch (error) {
      console.error('Error processing queue:', error);
    } finally {
      this.processing = false;
    }
  }

  clearQueue() {
    this.queue = [];
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }
}

export const queueService = QueueService.getInstance();
