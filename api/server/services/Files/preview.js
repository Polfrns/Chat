const { logger } = require('@librechat/data-schemas');
const { withTimeout, extractCodeArtifactText, getExtractedTextFormat } = require('@librechat/api');
const { updateFile } = require('~/models');

/**
 * Hard ceiling on the deferred preview rendering (HTML extraction + DB
 * update). The inner office-render path already has its own 12s timeout
 * and a concurrency-limited queue; this is the outer guard that catches
 * pathological cases where queue wait + render + DB write would
 * otherwise hang the file in `status: 'pending'` indefinitely.
 *
 * If the timeout fires the record is updated to `status: 'failed'`
 * with `previewError: 'timeout'` and the UI shows download-only.
 */
const PREVIEW_FINALIZE_TIMEOUT_MS = 60_000;

/**
 * Render the inline HTML preview for a generated file (or plain
 * text for non-office buckets that still benefit from caching), then
 * atomically transition the DB record to `status: 'ready'` (with
 * `text`/`textFormat`) or `status: 'failed'` (with `previewError`).
 *
 * Decoupled from `processCodeOutput` so the agent's final response is
 * not blocked on potentially slow office rendering. The caller fires
 * this without awaiting; promises continue running after the HTTP
 * response closes (Node doesn't kill them) and the frontend learns of
 * completion via the `attachment` update SSE event (if the stream is
 * still open) or via React Query polling otherwise. Process restart
 * is the only thing that can lose progress — covered by the boot-time
 * orphan sweep.
 *
 * @param {object} params
 * @param {Buffer} params.buffer - The full downloaded file contents,
 *   bounded by the server's `fileSizeLimit` config (defaults far above
 *   the 1MB extractor cap). The buffer is captured by the closure
 *   returned in `{ finalize }`, so when many office files queue behind
 *   the inner concurrency limiter (cap 2), all queued buffers stay
 *   resident until each one's slot frees. For a tool result emitting
 *   N office files, peak heap usage from this path is up to
 *   `N * fileSizeLimit`. Acceptable for typical agent runs (a handful
 *   of files at a few hundred KB each); pathological cases are bounded
 *   by the inner per-file 12s timeout and the outer 60s render cap.
 * @param {string} params.leafName - Basename for classification.
 * @param {string} params.mimeType - Detected/inferred MIME.
 * @param {string} params.category - Classifier output.
 * @param {string} params.file_id - The DB record key for the update.
 * @param {string} [params.previewRevision] - Generation marker stamped
 *   by the immediate persist step. The DB commit is conditional on
 *   this — if a newer emit (cross-turn filename reuse) has rotated
 *   the revision before this render finishes, `updateFile` returns
 *   null and the stale render is silently discarded rather than
 *   overwriting the newer record.
 * @returns {Promise<MongoFile | null>} The post-update record on
 *   success; `null` if the DB update itself failed (extraction failure
 *   is reflected as `status: 'failed'`, not a thrown error) or if the
 *   `previewRevision` guard rejected the write.
 */
const finalizePreview = async ({
  buffer,
  leafName,
  mimeType,
  category,
  file_id,
  previewRevision,
}) => {
  let text = null;
  let previewError;
  try {
    text = await withTimeout(
      extractCodeArtifactText(buffer, leafName, mimeType, category),
      PREVIEW_FINALIZE_TIMEOUT_MS,
      `Preview extraction exceeded ${PREVIEW_FINALIZE_TIMEOUT_MS}ms`,
    );
  } catch (_error) {
    /* `extractCodeArtifactText` swallows its own errors and returns null,
     * so the only way to reach here is a `withTimeout` rejection — i.e.
     * the queue + render combined exceeded the outer 60s ceiling. */
    previewError = 'timeout';
    logger.warn(
      `[finalizePreview] ${file_id}: extraction timed out after ${PREVIEW_FINALIZE_TIMEOUT_MS}ms`,
    );
  }
  /* HTML-or-null contract (PR #12934): null result on an office file
   * must NOT fall back to plain text — surface as failed. Caller gates
   * on `hasOfficeHtmlPath`, so reaching here always means office. */
  const textFormat = getExtractedTextFormat(leafName, mimeType, text);
  const failed = text == null;
  const status = failed ? 'failed' : 'ready';
  if (failed && !previewError) {
    previewError = 'parser-error';
  }
  try {
    /* Conditional update: commit only if `previewRevision` still
     * matches what the immediate persist step stamped. If a newer
     * emit has rotated the revision (cross-turn filename reuse),
     * `updateFile` returns null and the stale render is silently
     * discarded. (Codex P1 review on PR #12957.) */
    const updated = await updateFile(
      {
        file_id,
        text,
        textFormat,
        status,
        previewError: failed ? previewError : null,
      },
      previewRevision ? { previewRevision } : undefined,
    );
    if (!updated && previewRevision) {
      logger.debug(
        `[finalizePreview] ${file_id}: stale render skipped — newer emit has superseded revision ${previewRevision}`,
      );
    }
    return updated;
  } catch (error) {
    logger.error(
      `[finalizePreview] ${file_id}: failed to persist preview result: ${error?.message ?? error}`,
    );
    return null;
  }
};

/**
 * Run the background `finalize` thunk returned by `processCodeOutput`
 * and route the resolved record to the caller's emit logic. Shared
 * between `callbacks.js` (chat-completions + Open Responses) and
 * `tools.js` (direct tool endpoint) so the fire-and-forget pattern
 * doesn't drift across callsites.
 *
 * `onResolved` receives the post-update DB record and is the only piece
 * that varies — chat-completions writes the legacy `attachment` SSE
 * event, Open Responses writes the spec-shaped `librechat:attachment`
 * event with a sequence number, and the direct tool endpoint has no
 * stream to write to (caller passes a no-op).
 *
 * The catch path is the safety net for unexpected programming errors
 * inside `finalizePreview` ONLY. The function is designed to never
 * throw (extraction and DB failures are translated to `status: 'failed'`
 * inside it), but a ref error or future regression would otherwise
 * leave the DB record stuck at `'pending'` until the boot-time orphan
 * sweep — potentially hours away on a stable server. We attempt a
 * best-effort `updateFile` to mark the record `'failed'` with
 * `previewError: 'unexpected'` so the UI stops polling and the
 * next-turn LLM context surfaces the failure.
 *
 * `onResolved` errors are deliberately isolated in their own try/catch.
 * Without that isolation, a transient transport-side failure (SSE write
 * race after the stream closed, an emitter listener throwing) would
 * propagate into the finalize catch and downgrade an *already-resolved*
 * record to `failed` with `previewError: 'unexpected'` — surfacing
 * "preview unavailable" in the UI even though extraction succeeded
 * and the file is on disk. The emit failure is logged but the DB
 * record stays at whatever `finalizePreview` wrote (typically
 * `'ready'`), so the polling layer / next page load still sees the
 * resolved preview.
 *
 * @param {object} params
 * @param {(() => Promise<object | null>) | undefined} params.finalize - The
 *   thunk returned by `processCodeOutput`. No-op when undefined.
 * @param {string | undefined} params.fileId - DB key for the failure
 *   marker; if absent the catch only logs.
 * @param {string | undefined} [params.previewRevision] - Generation
 *   marker stamped by the immediate persist step. The defensive
 *   `updateFile` in the catch is conditional on this — if a newer
 *   emit has rotated the revision, the stale failure marker is
 *   silently discarded so a programming error from an older render
 *   doesn't override a newer turn's record.
 * @param {(updated: object) => void} [params.onResolved] - Called once
 *   on success with the post-update record.
 */
const runPreviewFinalize = ({ finalize, fileId, previewRevision, onResolved }) => {
  if (typeof finalize !== 'function') {
    return;
  }
  finalize()
    .then((updated) => {
      if (!updated || !onResolved) {
        return;
      }
      /* Isolated try/catch — a throw inside `onResolved` (transport-side
       * SSE write race, emitter listener error) MUST NOT propagate to
       * the outer `.catch`, which would downgrade an already-resolved
       * record to `failed` with `previewError: 'unexpected'`.
       * Extraction succeeded at this point and `finalizePreview` has
       * already persisted the terminal status; the polling layer / next
       * page load will surface the resolved preview even if this turn's
       * SSE emit didn't land. */
      try {
        onResolved(updated);
      } catch (emitError) {
        logger.error(
          `[runPreviewFinalize] onResolved threw for ${fileId}; record stays at the finalized status:`,
          emitError,
        );
      }
    })
    .catch((error) => {
      logger.error('Error rendering deferred preview:', error);
      if (!fileId) {
        return;
      }
      updateFile(
        {
          file_id: fileId,
          status: 'failed',
          previewError: 'unexpected',
        },
        previewRevision ? { previewRevision } : undefined,
      ).catch((updateErr) => {
        logger.error(
          `[runPreviewFinalize] also failed to mark ${fileId} as failed after error:`,
          updateErr,
        );
      });
    });
};


module.exports = { finalizePreview, runPreviewFinalize };
