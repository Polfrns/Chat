/**
 * Restores the latest generated files on the ordered conversation branch.
 * Explicit uploads start a new editing base; older output batches are retained
 * in chat history but must not replace the most recent generated result.
 * @param {{ messages: object[], options: object, getFiles: Function }} params
 * @returns {Promise<object[] | null>}
 */
async function restoreBridgeOutputs({ messages, options, getFiles }) {
  const model = options.agent?.model_parameters?.model ?? options.agent?.model ?? options.model;
  if (
    !['gpt-codex', 'gpt-codex-fast', 'gpt-codex-deep', 'claude-max', 'claude-max-fast', 'claude-max-deep'].includes(model) ||
    options.resendFiles === false ||
    options.req?.body?.files?.length > 0
  ) {
    return null;
  }
  const userId = options.req?.user?.id;
  if (!userId) {
    return null;
  }

  for (let index = messages.length - 2; index >= 0; index--) {
    const message = messages[index];
    if (message.isCreatedByUser || message.role === 'user' || message.sender?.toLowerCase() === 'user') {
      continue;
    }
    const outputs = (message.attachments ?? []).filter((file) =>
      typeof file.file_id === 'string' &&
      typeof file.toolCallId === 'string' &&
      file.toolCallId.startsWith('bridge-output-'),
    );
    if (outputs.length === 0) {
      continue;
    }

    const ids = [...new Set(outputs.map((file) => file.file_id))];
    const filter = { file_id: { $in: ids }, user: userId };
    if (options.req.user.tenantId != null) {
      filter.tenantId = options.req.user.tenantId;
    }
    const files = await getFiles(filter, {}, {});
    const byId = new Map(files.map((file) => [file.file_id, file]));
    if (ids.some((id) => !byId.get(id)?.filepath)) {
      throw new Error('The latest edited file is no longer available. Reattach that version to continue editing; the original will not be used automatically.');
    }
    return ids.map((id) => byId.get(id));
  }
  return null;
}

module.exports = { restoreBridgeOutputs };
