const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export type QueueStatus = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
};

export type QueueJob = {
  id: string;
  name: string;
  data: Record<string, unknown>;
  progress: number | Record<string, unknown>;
  state: string;
  attemptsMade: number;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
};

export type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed";

const QUEUE_DISPLAY_NAMES: Record<string, string> = {
  "reel-pipeline": "Анализ рилсов",
  pipeline: "Анализ рилсов",
  "video-generation": "Генерация видео",
  "scrape-reels": "Скрейпинг",
  scrape: "Скрейпинг",
};

/**
 * Получить человекочитаемое название очереди
 */
export function getQueueDisplayName(queueName: string): string {
  return QUEUE_DISPLAY_NAMES[queueName] || queueName;
}

/**
 * Подсчитать общее количество ожидающих задач
 */
export function getTotalPendingJobs(queues: QueueStatus[]): number {
  return queues.reduce((sum, q) => sum + q.waiting, 0);
}

/**
 * Получить статус всех очередей
 */
export async function getQueuesStatus(): Promise<{ queues: QueueStatus[] }> {
  const response = await fetch(`${API_URL}/api/queues/status`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get queues status");
  }

  return response.json();
}

/**
 * Получить задачи из очереди
 */
export async function getQueueJobs(
  queueName: string,
  state: JobState = "waiting",
  start = 0,
  end = 50
): Promise<{ jobs: QueueJob[]; isPaused: boolean }> {
  const params = new URLSearchParams({
    state,
    start: start.toString(),
    end: end.toString(),
  });

  const response = await fetch(
    `${API_URL}/api/queues/${queueName}/jobs?${params}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error(`Failed to get jobs for queue ${queueName}`);
  }

  return response.json();
}

/**
 * Удалить задачу из очереди
 */
export async function removeJob(
  queueName: string,
  jobId: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/queues/${queueName}/jobs/${jobId}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to remove job");
  }
}

/**
 * Повторить проваленную задачу
 */
export async function retryJob(
  queueName: string,
  jobId: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/queues/${queueName}/jobs/${jobId}/retry`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to retry job");
  }
}

/**
 * Очистить завершённые/проваленные задачи
 */
export async function cleanQueue(
  queueName: string,
  state: "completed" | "failed" | "delayed" | "wait" = "completed"
): Promise<number> {
  const response = await fetch(`${API_URL}/api/queues/${queueName}/clean`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to clean queue");
  }

  const data = await response.json();
  return data.count;
}

/**
 * Удалить все ожидающие задачи (drain)
 */
export async function drainQueue(queueName: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/queues/${queueName}/drain`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to drain queue");
  }
}

/**
 * Полностью очистить очередь (obliterate)
 */
export async function obliterateQueue(queueName: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/queues/${queueName}/obliterate`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to obliterate queue");
  }
}

/**
 * Приостановить очередь
 */
export async function pauseQueue(queueName: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/queues/${queueName}/pause`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to pause queue");
  }
}

/**
 * Возобновить очередь
 */
export async function resumeQueue(queueName: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/queues/${queueName}/resume`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resume queue");
  }
}
