# Roko — Current State Spec

> Snapshot of what's in the repo as of June 2026, before the leedeo-filestore migration.
> Superseded by SPEC.md once the planned changes land.

---

## What is Roko

Roko is an AI assistant product built on a fork of [LibreChat](https://github.com/danny-avila/LibreChat). The key differentiator is **session-scoped persistent file storage**: every LibreChat conversation belongs to a Roko session, and agents running in that conversation get access to filestores (named, persistent file namespaces) scoped to that session. Agents can list, read, write, and search files inside a filestore via MCP tools.

---

## Repository Layout

This is the LibreChat monorepo with custom code layered on top. Custom code lives in:

| Path | What it is |
|---|---|
| `packages/roko-server/` | Standalone filestore microservice (stand-in, to be replaced) |
| `packages/api/src/roko/` | HTTP client + JWT minting — LibreChat's one connection point to the filestore service |
| `packages/api/src/sessions/` | Session CRUD handlers + the approval-request stores |
| `packages/api/src/endpoints/claude/` | Custom Claude subscription (OAuth) endpoint |
| `api/server/routes/sessions.js` | Express routes wiring session handlers into the /api layer |
| `api/server/routes/filestores.js` | Express routes proxying filestore CRUD through to Roko |
| `api/server/services/roko/` | Agent hooks (PreToolUse / PostToolUse) for session-scoped permission logic |
| `client/src/components/Sessions/` | Session sidebar, panel, and create-dialog UI |
| `client/src/data-provider/Sessions/` | React Query hooks + SSE stream client for sessions and filestore requests |
| `packages/data-provider/src/` | Shared types, endpoints, query keys for the session/filestore API |
| `packages/data-schemas/src/schema/chatSession.ts` | MongoDB `ChatSession` model |

Upstream LibreChat files are touched minimally: `api/server/services/MCP.js`, `api/server/services/initializeMCPs.js`, `packages/api/src/agents/load.ts`, and a few config/model files.

---

## Feature 1 — Claude Subscription Provider

`packages/api/src/endpoints/claude/`

LibreChat natively supports many LLM providers via its custom endpoint system (YAML-configured, selectable in the UI via a dropdown). Claude via an API key already works out of the box. This feature adds a **second Claude endpoint type** that authenticates via a Claude.ai subscription (OAuth / PKCE) rather than an API key.

### How it works

1. On first use the user is redirected through Claude's PKCE OAuth flow (`oauth.ts`). The resulting access + refresh tokens are stored in LibreChat's existing encrypted user-key storage.
2. At inference time the token is fetched, refreshed if stale, and attached as a bearer to requests to the Anthropic API (`tokens.ts`, `fetch.ts`).
3. The endpoint registers itself as a provider in `packages/api/src/endpoints/config/providers.ts` and `models.ts` so it appears in the UI dropdown alongside other endpoints.

### Files

```
packages/api/src/endpoints/claude/
  constants.ts   — Anthropic OAuth URLs, client ID, scopes
  oauth.ts       — PKCE pair generation + authorize/token URL builders
  tokens.ts      — token retrieval, refresh, encrypted storage
  fetch.ts       — Anthropic API fetch wrapper using the subscription token
  llm.ts         — LangChain-compatible LLM class
  index.ts       — re-exports
  *.spec.ts      — unit tests for each module
```

---

## Feature 2 — Roko Session and Filestore System

### Concepts

- **Filestore** — a named, persistent file namespace (currently: a directory on the filestore server's disk). Has an owner (`subject`) and a tenant. Access: `shared(tenant) ∪ private(subject)`.
- **Session** — a LibreChat-side record that groups conversations and holds a list of attached filestore IDs. One session per conversation (enforced on the frontend); session ID is propagated into the agent run so the MCP tools know what's in scope.
- **roko-server** — the current filestore service (a temporary stand-in, lives at `packages/roko-server/`). Exposes the same filestores over two faces: an MCP server (for agents) and a management REST API (for the UI). SQLite registry, local-disk storage.

### Data model

**`ChatSession`** (MongoDB, `packages/data-schemas/src/schema/chatSession.ts`):
```
_id, userId, name, filestoreIds: string[], createdAt, updatedAt
```

Conversations have a `sessionId` field (added to the existing LibreChat Conversation schema) linking them to their session.

### Auth between LibreChat and roko-server

LibreChat mints a short-lived HS256 JWT `{ sub: userId, tenant: orgId }` signed with a shared secret (`ROKO_SHARED_SECRET`). This token is sent as a bearer on every HTTP call to roko-server, and is also injected into the MCP session's `Authorization` header so roko-server can apply per-identity access control on tool calls.

`packages/api/src/roko/token.ts` — minting  
`packages/api/src/roko/client.ts` — all REST calls to roko-server

### Request flow — agent tool call

```
Agent (backend)
  │
  ├── PreToolUse hook (hooks.js)
  │     ├── list_filestores: allow always (Roko filters by identity anyway)
  │     ├── create_filestore: surface creation-request to user → block → allow or deny
  │     └── drive tool (read_file, write_file, …):
  │           ├── filestore in session? → allow
  │           └── not in session? → surface access-request to user → block → allow or deny
  │
  ├── Tool executes (MCP call to roko-server /mcp)
  │
  └── PostToolUse hook (hooks.js)
        ├── create_filestore success: attach new store to session
        └── list_filestores: annotate result (in-session vs attachable)
```

**Blocking mechanism**: hooks raise an entry in the `filestoreAccessRequests` or `filestoreCreationRequests` store (`packages/api/src/sessions/requests/`), then await `waitForDecision`. The store is Redis-backed (pub/sub across instances, in-process fallback). The frontend subscribes to a per-session SSE stream (`/api/sessions/:id/requests/stream`) and shows the appropriate approval dialog. The user's decision is POSTed back to `/api/sessions/:id/requests/decide`, which publishes to Redis and resolves the hook's `waitForDecision`. Timeout: 120 s.

### Request flow — session lifecycle

**At message submit** (frontend, `useSubmitMessage`): if the conversation is new, a session is created eagerly before the message is sent, and `sessionId` is stored in the conversation state.

**Reactively** (`useEnsureChatSession`): once a `conversationId` is confirmed, the hook assigns the conversation to its session in the DB. If an existing conversation somehow has no session, one is created as a fallback.

**Session naming**: once LibreChat auto-generates a chat title, `useEnsureChatSession` renames the session to match.

### Frontend components

```
client/src/components/Sessions/
  SessionSidebar.tsx     — collapsible sidebar listing sessions + their filestores
  SessionsPanel.tsx      — full panel for managing filestores and the session's conversations
  SessionCreateDialog.tsx — dialog shown when creating or naming a session

client/src/data-provider/Sessions/
  queries.ts    — useGetSessions, useGetSession, useGetSessionFilestores, …
  mutations.ts  — useCreateSession, useUpdateSession, useAssignChatToSession, …
  stream.ts     — SSE client for the per-session filestore-request stream
  index.ts      — re-exports
```

### API endpoints

All under `/api/`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/sessions` | list user's sessions |
| POST | `/sessions` | create session |
| GET | `/sessions/:id` | get session |
| PATCH | `/sessions/:id` | rename session |
| DELETE | `/sessions/:id` | delete session + cascade conversations |
| POST | `/sessions/:id/conversations` | assign conversation to session |
| GET | `/sessions/:id/filestores` | resolve session's filestore records |
| POST | `/sessions/:id/filestores` | attach filestore to session |
| DELETE | `/sessions/:id/filestores/:fid` | detach filestore from session |
| GET | `/sessions/:id/requests/stream` | SSE stream for pending filestore requests |
| GET | `/sessions/:id/requests` | list pending requests |
| POST | `/sessions/:id/requests/decide` | resolve a pending request |
| GET | `/filestores` | list accessible filestores (proxy to Roko) |
| POST | `/filestores` | create filestore (proxy to Roko) |
| PATCH | `/filestores/:id` | update filestore (proxy to Roko) |
| DELETE | `/filestores/:id` | delete filestore (proxy to Roko) |

### roko-server (stand-in)

`packages/roko-server/` — self-contained TS service, runs independently of LibreChat.

- Port: `3100` (default)
- MCP face: `POST /mcp` (streamable-HTTP, `mcp-session-id` header)
- REST face: `GET|POST /filestores`, `GET|PATCH|DELETE /filestores/:id`, `GET /filestores/:id/files`
- Auth: Bearer JWT `{ sub, tenant }` (same format LibreChat mints)
- Storage: SQLite registry (`roko.sqlite`) + local disk (`./data/filestores/`)

MCP tools exposed: `list_filestores`, `create_filestore`, `list_files`, `read_file`, `write_file`, `create_folder`, `move_file`, `search_files`.

### Environment variables

```
ROKO_URL            — base URL of the filestore service (default: http://localhost:3100)
ROKO_SHARED_SECRET  — HS256 signing secret (must match the service)
```

---

## Known Limitations / Temporary State

- `packages/roko-server` is explicitly temporary — its commit message says "lives in the LibreChat monorepo temporarily".
- The HS256 shared-secret auth between LibreChat and roko-server is flagged as a temporary scheme; the token minting code notes "seam for future auth broker".
- The blocking approval flow (Redis pub/sub + SSE) is the current approach for PreToolUse permission gating; its design is under review.
- Only the `local` filestore backend is implemented in roko-server; a `graph` variant is noted as future.
