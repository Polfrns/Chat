# roko-server

The Roko **filestore manager** — a standalone service that owns file stores and
exposes them over **two faces sharing one core**, both authed by the same bearer
token:

- **MCP server** (`/mcp`, streamable-HTTP) — for AI agents (LibreChat and any
  other agent software). Tools: `list_filestores`, `create_filestore`,
  `list_files`, `read_file`, `write_file`, `create_folder`, `move_file`,
  `search_files`. Each filestore tool takes a `filestore_id`.
- **Management REST** (`/filestores`) — for UIs/CRUD: list, get, create, edit,
  delete, and read the file tree.

It is **session-agnostic**: it knows only the caller (`subject`) and their
`tenant`. Per-session scoping, approval flows, etc. live in the *consuming* app.

## Access model

```
accessible = shared(tenant) ∪ private(subject)
```

A store is reachable when it's in your tenant and either shared or owned by you.
Editing/deleting a store is owner-only.

## Architecture

One core, two faces — nothing is duplicated between them:

```
auth ─┐
      ├─► FilestoreService ─► RokoRegistry (SQLite, metadata)
mcp ──┤        │
rest ─┘        └─► FileStore port ─► LocalFileStore (fs)   [GraphFileStore later]
```

`FileStore` is the *intersection* of all backends; local vs graph is an adapter
concern invisible above the port line.

## Run it

```bash
# from the repo root (installs the workspace's deps incl. better-sqlite3)
npm install

cp packages/roko-server/.env.example packages/roko-server/.env   # set ROKO_SHARED_SECRET
cd packages/roko-server
npm run dev        # tsx watch — no build step needed
```

## Try it

```bash
TOKEN=$(npm run -s token)                 # mint a dev bearer (sub=dev-user, tenant=dev-tenant)

# REST
curl -s localhost:3100/filestores -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:3100/filestores -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"notes","description":"scratch"}'
```

The MCP face speaks the streamable-HTTP protocol (initialize handshake +
`mcp-session-id`); point an MCP client at `http://localhost:3100/mcp` with the
same `Authorization: Bearer` header.

## Config (env)

| Var | Default | Purpose |
|---|---|---|
| `ROKO_PORT` | `3100` | HTTP port |
| `ROKO_SHARED_SECRET` | — (required) | bearer JWT secret (must match LibreChat's) |
| `ROKO_DATA_DIR` | `./data` | base for the defaults below |
| `ROKO_FILESTORE_ROOT` | `<DATA_DIR>/filestores` | local file bytes |
| `ROKO_DB_PATH` | `<DATA_DIR>/roko.sqlite` | registry DB |

> Temporary home: this lives in the LibreChat monorepo for convenience and is
> meant to be extracted to its own repo later — it has no dependency on the rest
> of the workspace.
