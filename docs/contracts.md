# Trender API Contracts (Official)

This document defines the official API contracts for the Trender application, aligned with the server implementation as of Dec 23, 2025.

---

## 1. Onboarding & Authentication
Handles user entry and session management.

### Mobile Authentication
- **Endpoint**: `POST /api/v1/auth/mobile`
- **Auth**: `Basic` authentication header
- **Response**: `AuthResponseSchema`
  ```json
  {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 3600
  }
  ```

### Refresh Token
- **Endpoint**: `POST /api/v1/auth/refresh`
- **Request**: `{ "refreshToken": "string" }`

---

## 2. Content Creation (Remix Flow)
The process of creating a new video from a template or upload.

### Step 1: Browse Trends
- **Endpoint**: `GET /api/templates/feed`
- **Query**: `limit`, `cursor`, `category`, `tags`, `sort`
- **Response**: `FeedResponseSchema` (includes `items`, `nextCursor`, `hasMore`)

### Step 2: Get Editor Data
- **Simple Mode**: `GET /api/remix/{analysisId}/simple`
- **Expert Mode**: `GET /api/remix/{analysisId}/expert`
- **Response**: Returns elements, scenes, and available remix options.

### Step 3: Configure Remix (Save Selections)
- **Simple Mode**: `POST /api/remix/{analysisId}/simple/configure`
- **Expert Mode**: `POST /api/remix/{analysisId}/expert/configure`
- **Response**: `{ "success": true, "configurationId": "uuid", "generatedPrompt": "string" }`

### Step 4: Initiate Generation
- **Endpoint**: `POST /api/generate/`
- **Request**: 
  ```json
  {
    "configurationId": "uuid_from_step_3",
    "options": { "duration": 5, "aspectRatio": "9:16" }
  }
  ```
- **Response**: `{ "success": true, "generationId": "uuid", "status": "queued" }`

### Step 5: Poll Status
- **Endpoint**: `GET /api/generate/{generationId}/status`
- **Response**: `GenerationStatusResponseSchema`
  ```json
  {
    "status": "queued|processing|completed|failed",
    "progress": 75,
    "result": { "videoUrl": "string", "thumbnailUrl": "string" }
  }
  ```

---

## 3. Discovery & Community
Exploring trends and community content.

### Trending Tags
- **Endpoint**: `GET /api/trends/tags`
- **Response**: `{ "tags": Array<{ "tag": "string", "score": number }> }`

### List All Templates
- **Endpoint**: `GET /api/templates/`
- **Query**: `limit`, `offset`, `category`, `tag`, `search`

---

## 4. Custom Creation (Import)
Importing your own videos for remixing.

### Import from URL (Instagram)
- **Endpoint**: `POST /api/content/from-url`
- **Request**: `{ "url": "string", "autoProcess": true }`

### Upload Video File
- **Endpoint**: `POST /api/content/upload`
- **Body**: `multipart/form-data` (field: `video`)

### Analysis Status (Polling)
- **Endpoint**: `GET /api/content/{contentId}/status`
- **Response**: When `status` is `ready`, includes `analysis` object for the Remix flow.

---

## 5. Profile & Management
Accessing user-specific data.

### Generation History
- **Endpoint**: `GET /api/generate/` (List view)
- **Query**: `limit`, `offset`, `status`
- **Response**: `GenerationsListResponseSchema`

### Template Details
- **Endpoint**: `GET /api/templates/{id}`
- **Response**: Detailed template data with original reel and analysis.
