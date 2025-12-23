# API Контракты для клиентского флоу

## Обзор флоу

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Feed    │────▶│  2. Input   │────▶│  3. Remix   │────▶│ 4. Generate │
│ (templates) │     │ (url/upload)│     │(simple/exp) │     │   (video)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## 1. Feed - Просмотр темплейтов

### GET /api/templates/feed

Получение фида готовых темплейтов с cursor-based пагинацией.

**Query параметры:**
```typescript
{
  type?: 'trends' | 'community' | 'bookmarks';  // default: 'trends'
  limit?: number;        // default: 20, max: 50
  cursor?: string;       // ID последнего элемента для пагинации
  category?: string;     // фильтр по категории
  tags?: string;         // comma-separated теги
  sort?: 'popular' | 'recent' | 'trending';  // default: 'popular'
}
```

#### Типы фидов

| type | Описание | Требует авторизации |
|------|----------|---------------------|
| `trends` | Отобранные редакцией темплейты (isFeatured=true) | Нет |
| `community` | Все опубликованные темплейты от пользователей | Нет |
| `bookmarks` | Сохранённые в закладки темплейты текущего пользователя | Да |

**Примеры запросов:**
```bash
# Тренды (по умолчанию)
GET /api/templates/feed
GET /api/templates/feed?type=trends

# Все темплейты сообщества
GET /api/templates/feed?type=community

# Закладки пользователя (требует авторизации)
GET /api/templates/feed?type=bookmarks

# С фильтрами
GET /api/templates/feed?type=community&category=dance&sort=popular
GET /api/templates/feed?type=trends&tags=viral,fashion&limit=10
```

**Ответ:**
```typescript
{
  items: Array<{
    id: string;
    title: string | null;
    tags: string[];
    category: string | null;
    thumbnailUrl: string;
    previewVideoUrl?: string;
    generationCount: number;
    isBookmarked: boolean;     // true если пользователь добавил в закладки
    reel: {
      id: string;
      author: string | null;
      likeCount: number | null;
    };
    elements: Array<{
      id: string;
      type: 'character' | 'object' | 'background';
      label: string;
    }>;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}
```

---

### GET /api/templates/search

Поиск темплейтов по названию, тегам и категории.

**Query параметры:**
```typescript
{
  q: string;             // поисковый запрос (обязательный)
  limit?: number;        // default: 20, max: 50
  cursor?: string;       // ID для пагинации
}
```

**Примеры запросов:**
```bash
# Поиск по ключевому слову
GET /api/templates/search?q=dance

# С пагинацией
GET /api/templates/search?q=fashion&limit=10&cursor=abc123
```

**Ответ:** идентичен `/api/templates/feed`

---

### POST /api/templates/{id}/bookmark

Добавить темплейт в закладки. Требует авторизации.

**Ответ:**
```typescript
{
  bookmarked: true;
}
```

---

### DELETE /api/templates/{id}/bookmark

Удалить темплейт из закладок. Требует авторизации.

**Ответ:**
```typescript
{
  bookmarked: false;
}
```

---

## 2. Input - Добавление контента

### POST /api/content/from-url

Добавление видео по URL Instagram.

**Body:**
```typescript
{
  url: string;           // Instagram URL
  autoProcess?: boolean; // default: true
}
```

**Ответ:**
```typescript
{
  success: boolean;
  contentId: string;     // ID для polling
  status: 'new' | 'existing' | 'processing';
  existingAnalysis?: {
    analysisId: string;
    templateId?: string;
  };
  jobId?: string;
}
```

### POST /api/content/upload

Загрузка видео файла.

**Body:** `multipart/form-data`
- `video`: File (max 100MB)

**Ответ:**
```typescript
{
  success: boolean;
  contentId: string;
  jobId: string;
  status: 'processing';
}
```

### GET /api/content/{contentId}/status

Polling статуса обработки.

**Ответ:**
```typescript
{
  contentId: string;
  status: 'pending' | 'downloading' | 'analyzing' | 'ready' | 'failed';
  progress: number;      // 0-100
  stage: string;
  message: string;
  analysis?: {
    id: string;
    duration: number | null;
    aspectRatio: string;
    elements: DetectableElement[];
    scenes?: SceneInfo[];
  };
  templateId?: string;
  error?: string;
}
```

---

## 3. Remix - Конфигурация генерации

### Simple Mode

#### GET /api/remix/{analysisId}/simple

Получение данных для Simple Mode.

**Ответ:**
```typescript
{
  analysisId: string;
  sourceVideo: {
    url: string;
    thumbnailUrl: string;
    duration: number | null;
    aspectRatio: string;
  };
  elements: Array<{
    id: string;
    type: 'character' | 'object' | 'background';
    label: string;
    description: string;
    thumbnailUrl?: string;
    remixOptions: Array<{
      id: string;
      label: string;
      icon: string;
      prompt: string;
    }>;
    allowCustomImage: boolean;
  }>;
  scenes?: SimpleScene[];
  isSceneBased: boolean;
}
```

#### POST /api/remix/{analysisId}/simple/configure

Сохранение выбора Simple Mode.

**Body:**
```typescript
{
  selections: Array<{
    elementId: string;
    selectedOptionId?: string;   // ID выбранной опции
    customMediaId?: string;      // ID из медиа-библиотеки
    customMediaUrl?: string;     // или прямой URL
  }>;
  sceneSelections?: Array<{
    sceneId: string;
    useOriginal: boolean;
    elementSelections?: ElementSelection[];
  }>;
}
```

**Ответ:**
```typescript
{
  success: boolean;
  configurationId: string;
  generatedPrompt: string;
  estimatedCredits: number;
}
```

### Expert Mode

#### GET /api/remix/{analysisId}/expert

Получение данных для Expert Mode.

**Ответ:**
```typescript
{
  analysisId: string;
  sourceVideo: { url, thumbnailUrl, duration, aspectRatio };
  suggestedPrompt: string;
  elements: Array<{ id, type, label, description }>;
  scenes?: Array<{ id, index, startTime, endTime, suggestedPrompt }>;
  promptHints: string[];
  previousGenerations?: Array<{ id, prompt, thumbnailUrl, status }>;
}
```

#### POST /api/remix/{analysisId}/expert/configure

Сохранение конфигурации Expert Mode.

**Body:**
```typescript
{
  prompt: string;
  referenceImages?: string[];
  scenePrompts?: Array<{
    sceneId: string;
    prompt: string;
    useOriginal: boolean;
  }>;
  options?: {
    duration?: 5 | 10;
    aspectRatio?: '16:9' | '9:16' | '1:1' | 'auto';
    keepAudio?: boolean;
  };
}
```

---

## 4. Generate - Генерация видео

### POST /api/generate

Запуск генерации.

**Body:**
```typescript
{
  configurationId?: string;  // из Simple/Expert configure
  // или прямые параметры:
  analysisId?: string;
  prompt?: string;
  options?: GenerationOptions;
}
```

**Ответ:**
```typescript
{
  success: boolean;
  generationId: string;
  status: 'queued';
}
```

### GET /api/generate/{generationId}/status

Polling статуса генерации.

**Ответ:**
```typescript
{
  generationId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
  message: string;
  providerProgress?: number;
  result?: {
    videoUrl: string;
    thumbnailUrl: string | null;
    duration: number | null;
  };
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

### GET /api/generate

Список генераций.

**Query:**
```typescript
{
  limit?: number;
  offset?: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
```

---

## 5. Media Library - Библиотека медиа

### GET /api/media/personal

Личные медиа пользователя.

**Query:**
```typescript
{
  type?: 'image' | 'video' | 'all';
  limit?: number;
  offset?: number;
}
```

**Ответ:**
```typescript
{
  items: MediaItem[];
  total: number;
  limit: number;
  offset: number;
}
```

### POST /api/media/upload

Загрузка в библиотеку.

**Body:** `multipart/form-data`
- `file`: File (image max 20MB, video max 100MB)

### DELETE /api/media/{id}

Удаление медиа.

### GET /api/media/stock

Стоковые медиа (TODO: интеграция с Pexels/Unsplash).

---

## Типы данных

### DetectableElement
```typescript
{
  id: string;
  type: 'character' | 'object' | 'background';
  label: string;
  description: string;
  remixOptions: RemixOption[];
}
```

### RemixOption
```typescript
{
  id: string;
  label: string;
  icon: string;      // emoji
  prompt: string;    // промпт для трансформации
}
```

### MediaItem
```typescript
{
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl: string;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;  // для видео
  mimeType: string | null;
  createdAt: string;
}
```

### GenerationOptions
```typescript
{
  duration?: 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1' | 'auto';
  keepAudio?: boolean;
}
```
