const { HookRegistry } = require('@librechat/agents');
const { Constants } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { filestoreAccessRequests, filestoreCreationRequests } = require('@librechat/api');
const db = require('~/models');
const { rokoClient } = require('~/server/services/roko');

/**
 * Session-scoping enforced as LibreChat agent hooks. The leedeo-filestore
 * service is session-agnostic (the deployment API key reaches every store the
 * service account can see); these hooks layer the per-session policy on top,
 * entirely on the LibreChat side:
 *
 *  - PreToolUse on a drive tool: allow if the target store is attached to the
 *    session; otherwise raise an approval (the existing access-request popup),
 *    block until the user decides, and allow iff they attach it.
 *  - PreToolUse on `search_knowledge`: same gate over `filestore_uids`, raised
 *    as ONE batch so the popup shows all missing stores in a single checklist.
 *  - PreToolUse on `create_filestore`: surface a pre-filled create popup, block,
 *    then deny (declined) or allow with the user's edited fields (`updatedInput`).
 *  - PostToolUse on `create_filestore`: attach the new store to the session.
 *  - PostToolUse on `list_filestores`: annotate the result as in-session vs
 *    available-to-attach so the model knows which it can use directly.
 *
 * The approval waits are self-contained: the callback awaits the request stores'
 * `waitForDecision` (Redis pub/sub across instances, in-process otherwise), which
 * the session decide-endpoints resolve.
 */

const DELIMITER = Constants.mcp_delimiter; // '_mcp_'
const SERVER = Constants.roko_mcp_server; // 'leedeo-filestore'
const DRIVE_TOOLS = new Set([
  'list_files',
  'read_file',
  'create_file',
  'str_replace_file',
  'create_folder',
  'move_file',
  'delete_file',
  'search_files',
  /** LibreChat-native transfer tools (not on the MCP server) — same
   *  single-store gate, since both take a `filestore_uid`. */
  'upload_chat_file',
  'deliver_filestore_file',
]);
const ROKO_TOOLS = new Set([
  ...DRIVE_TOOLS,
  'list_filestores',
  'search_filestores',
  'create_filestore',
  'search_knowledge',
]);

const ALLOW = { decision: 'allow' };
const APPROVAL_TIMEOUT_MS = 120_000;

/**
 * The filestore base tool name (e.g. `read_file`), or null if not one of ours.
 * Tolerant of how the runtime spells the name: `<base>_mcp_leedeo-filestore` (the
 * usual MCP form) or a bare `<base>` — matched against the known tools.
 */
function baseTool(toolName) {
  if (typeof toolName !== 'string') {
    return null;
  }
  const idx = toolName.indexOf(DELIMITER);
  if (idx !== -1) {
    const base = toolName.slice(0, idx);
    const server = toolName.slice(idx + DELIMITER.length);
    return server === SERVER && ROKO_TOOLS.has(base) ? base : null;
  }
  return ROKO_TOOLS.has(toolName) ? toolName : null;
}

/** The text of a tool's output, tolerating a raw string or an MCP content-array
 *  shape. Returns null when there is no text block. */
function toolOutputText(toolOutput) {
  if (typeof toolOutput === 'string') {
    return toolOutput;
  }
  if (toolOutput && typeof toolOutput === 'object') {
    const content = toolOutput.content;
    if (Array.isArray(content)) {
      const block = content.find((b) => b && b.type === 'text' && typeof b.text === 'string');
      return block?.text ?? null;
    }
    if (typeof toolOutput.text === 'string') {
      return toolOutput.text;
    }
  }
  return null;
}

function describeStores(stores) {
  return stores
    .map((s) => `- ${s.displayName} (filestore_uid: ${s.uid})${s.readOnly ? ' [read-only]' : ''}`)
    .join('\n');
}

async function attachedFilestoreUids({ sessionId, identity }) {
  const session = await db.getChatSession(identity.subject, sessionId);
  return new Set((session?.filestoreUids ?? []).map(String));
}

/**
 * The session gate for a set of stores. Stores already attached pass; every
 * missing one is raised as an access request UP FRONT, so the approval popup
 * shows them all as a single checklist (one SSE snapshot), then the decisions
 * are awaited concurrently. Allow iff the user approves every missing store
 * (approved ones are attached by the decide-endpoint either way).
 */
async function gateStores(uids, { sessionId, identity }) {
  const attached = await attachedFilestoreUids({ sessionId, identity });
  const missing = [...new Set(uids)].filter((uid) => !attached.has(uid));
  if (missing.length === 0) {
    return ALLOW;
  }
  /** Fetch metadata so the popup entries are meaningful; if the service says any
   *  store is not accessible, deny outright without bothering the user. */
  const stores = await Promise.all(
    missing.map((uid) => rokoClient.getFilestore(uid).catch(() => null)),
  );
  const unknown = missing.filter((uid, i) => stores[i] === null);
  if (unknown.length > 0) {
    return {
      decision: 'deny',
      reason: `These file stores are not accessible: ${unknown.join(', ')}.`,
    };
  }
  await Promise.all(
    stores.map((store) =>
      filestoreAccessRequests.addRequest(sessionId, {
        filestoreUid: store.uid,
        displayName: store.displayName,
        description: store.description || undefined,
        shared: store.shared,
      }),
    ),
  );
  const decisions = await Promise.all(
    stores.map((store) =>
      filestoreAccessRequests.waitForDecision(sessionId, store.uid, APPROVAL_TIMEOUT_MS),
    ),
  );
  await Promise.all(
    stores.map((store) => filestoreAccessRequests.removeRequest(sessionId, store.uid)),
  );
  const refused = stores.filter((store, i) => decisions[i] !== 'approve');
  if (refused.length > 0) {
    return {
      decision: 'deny',
      reason: `The user did not grant these file stores to the session: ${refused
        .map((store) => store.displayName)
        .join(', ')}.`,
    };
  }
  return ALLOW;
}

async function preDriveTool(input, ctx) {
  const filestoreUid = input.toolInput?.filestore_uid;
  if (!filestoreUid) {
    return ALLOW; // let the service surface the missing-arg error
  }
  return gateStores([String(filestoreUid)], ctx);
}

/** `search_knowledge` spans several stores — all missing ones are requested in
 *  one batch so the user grants them from a single checklist. */
async function preSearchKnowledge(input, ctx) {
  const uids = Array.isArray(input.toolInput?.filestore_uids)
    ? input.toolInput.filestore_uids.map(String)
    : [];
  if (uids.length === 0) {
    return ALLOW;
  }
  return gateStores(uids, ctx);
}

async function preCreateFilestore(input, { sessionId }) {
  const proposed = {
    displayName:
      typeof input.toolInput?.display_name === 'string' ? input.toolInput.display_name : '',
    description:
      typeof input.toolInput?.description === 'string' ? input.toolInput.description : '',
    shared: input.toolInput?.shared === true,
    readOnly: input.toolInput?.read_only === true,
  };
  const requestId = await filestoreCreationRequests.addRequest(sessionId, proposed);
  const decision = await filestoreCreationRequests.waitForDecision(
    sessionId,
    requestId,
    APPROVAL_TIMEOUT_MS,
  );
  await filestoreCreationRequests.removeRequest(sessionId, requestId);
  if (!decision || decision.status !== 'confirm') {
    return { decision: 'deny', reason: 'The user declined to create the file store.' };
  }
  const values = decision.values ?? proposed;
  /** Replace the model's args with the user's confirmed/edited values. */
  return {
    decision: 'allow',
    updatedInput: {
      ...input.toolInput,
      display_name: values.displayName,
      description: values.description,
      shared: values.shared === true,
      read_only: values.readOnly === true,
    },
  };
}

/** The tool returns prose, not JSON, so the annotation is rebuilt from the
 *  management REST — same registry, structured fields, at the cost of a second
 *  listing call.
 *  TODO(leedeo-filestore): the server must be adapted to return structured JSON
 *  from `list_filestores` (as its own API spec prescribes); this hook can then
 *  annotate the tool output directly and drop the duplicate REST call. */
async function annotateListFilestores(input, ctx) {
  let stores;
  try {
    ({ filestores: stores } = await rokoClient.listFilestores());
  } catch {
    return {};
  }
  const attached = await attachedFilestoreUids(ctx);
  const inSession = stores.filter((s) => attached.has(String(s.uid)));
  const available = stores.filter((s) => !attached.has(String(s.uid)));
  const text = [
    'File stores in THIS session (use their filestore_uid directly):',
    inSession.length ? describeStores(inSession) : '(none yet)',
    '',
    'Other file stores you can reach (using one will ask the user to attach it to this session):',
    available.length ? describeStores(available) : '(none)',
  ].join('\n');
  return { updatedOutput: text };
}

/** The created store's uid, from the tool's confirmation text
 *  (`Created filestore '<name>' (uid: <uid>, read-write).`). Uids are
 *  server-generated opaque values now, so there is no client-side fallback:
 *  if the wording changes the parse returns null and the store is simply not
 *  auto-attached.
 *  TODO(leedeo-filestore): the server must be adapted to return the created
 *  store as structured JSON (per its own API spec) so the uid can be read
 *  directly and the prose parse removed. */
function createdFilestoreUid(input) {
  const text = toolOutputText(input.toolOutput);
  return text?.match(/\(uid: ([^,)]+)[,)]/)?.[1]?.trim() ?? null;
}

async function attachCreatedFilestore(input, { sessionId, identity }) {
  const filestoreUid = createdFilestoreUid(input);
  if (filestoreUid) {
    try {
      await db.setSessionFilestore(identity.subject, sessionId, filestoreUid, true);
    } catch (error) {
      logger.warn('[roko hooks] failed to attach created filestore to session', error);
    }
  }
  return {};
}

/**
 * Build a per-run HookRegistry enforcing the session's filestore policy. Returns
 * `undefined` when there's no session (nothing to scope) so the run skips hook
 * dispatch entirely.
 * @param {{ sessionId?: string|null, identity: { subject: string } }} ctx
 */
function buildRokoHookRegistry(ctx) {
  if (!ctx?.sessionId || !ctx.identity?.subject) {
    logger.debug(
      `[roko hooks] not building registry (sessionId=${ctx?.sessionId ?? 'none'}, subject=${ctx?.identity?.subject ?? 'none'})`,
    );
    return undefined;
  }
  logger.info(`[roko hooks] registry built for session ${ctx.sessionId}`);
  const registry = new HookRegistry();

  registry.register('PreToolUse', {
    hooks: [
      async (input) => {
        const base = baseTool(input.toolName);
        logger.info(`[roko hooks] PreToolUse tool=${input.toolName} base=${base ?? 'n/a'}`);
        if (base === 'create_filestore') {
          return preCreateFilestore(input, ctx);
        }
        if (base === 'search_knowledge') {
          return preSearchKnowledge(input, ctx);
        }
        if (base && DRIVE_TOOLS.has(base)) {
          return preDriveTool(input, ctx);
        }
        return ALLOW;
      },
    ],
  });

  registry.register('PostToolUse', {
    hooks: [
      async (input) => {
        const base = baseTool(input.toolName);
        logger.info(`[roko hooks] PostToolUse tool=${input.toolName} base=${base ?? 'n/a'}`);
        if (base === 'list_filestores') {
          return annotateListFilestores(input, ctx);
        }
        if (base === 'create_filestore') {
          return attachCreatedFilestore(input, ctx);
        }
        return {};
      },
    ],
  });

  return registry;
}

module.exports = { buildRokoHookRegistry };
