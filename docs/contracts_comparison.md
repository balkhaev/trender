# API Contracts Comparison Report

This report compares the user flow documentation in `docs/flows.md` and the initial contracts in `docs/contracts.md` with the **actual server implementation** as found in `apps/server/src/index.ts` and associated route files.

## Summary of Discrepancies

### 1. Authentication
*   **Documented**: `POST /api/auth/mobile`
*   **Actual**: `POST /api/v1/auth/mobile`
*   **Impact**: Minor path change required in client code.

### 2. Remix Flow (Simple/Expert Mode)
*   **Documented**: `GET /api/templates/{id}` for editor data.
*   **Actual**: 
    - Dedicated remix endpoints: `GET /api/remix/{analysisId}/simple` and `GET /api/remix/{analysisId}/expert`.
    - Separated "Configuration" step: `POST /api/remix/{analysisId}/simple/configure`.
*   **Impact**: Significant. The client must first fetch specific remix data and then "Configure" before calling the "Generate" endpoint.

### 3. Video Generation
*   **Documented**: `POST /api/templates/{id}/generate` or `POST /api/video/generate`.
*   **Actual**: `POST /api/generate/`
    - Accepts `configurationId` (from the Remix Configure step) or `analysisId` + `prompt`.
*   **Status Polling**:
    - **Documented**: `GET /api/video/generation/{id}`
    - **Actual**: `GET /api/generate/{generationId}/status`
*   **Impact**: Path alignment needed.

### 4. Trends Feed
*   **Documented**: `GET /api/templates/feed` (Simple pagination).
*   **Actual**: `GET /api/templates/feed` (Cursor-based pagination with `items`, `nextCursor`, and `hasMore`).
*   **Impact**: Response schema is slightly more flexible in the actual code.

---

## Detailed Mapping

| Flow Step | documented Endpoint | Actual Endpoint |
|---|---|---|
| **Login** | `/api/auth/mobile` | `/api/v1/auth/mobile` |
| **Get Editor Data** | `/api/templates/{id}` | `/api/remix/{analysisId}/simple` (or expert) |
| **Save Selections** | *Missing* | `/api/remix/{analysisId}/simple/configure` |
| **Start Gen** | `/api/templates/{id}/generate` | `/api/generate/` |
| **Polling Status** | `/api/video/generation/{id}` | `/api/generate/{genId}/status` |
| **Direct Import** | `/api/content/from-url` | `/api/content/from-url` |

---

## Conclusion
The documentation in `docs/contracts.md` needs to be updated to match the actual path prefixes and the multi-step Remix process (Configure -> Generate) used by the backend.
