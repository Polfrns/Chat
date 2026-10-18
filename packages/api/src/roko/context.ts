export interface ChatFileRef {
  file_id?: string;
  filename?: string;
  type?: string;
}

/**
 * Context blurb listing the current message's attachments so the model can
 * reference them by `file_id` when calling `upload_chat_file`.
 */
export function buildChatFileContext(files: ChatFileRef[] | undefined): string {
  const entries = (files ?? []).filter((file) => Boolean(file?.file_id));
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map((file) => {
    const name = file.filename ? ` — ${file.filename}` : '';
    const type = file.type ? ` (${file.type})` : '';
    return `\t- file_id: ${file.file_id}${name}${type}`;
  });
  return [
    'Files attached to the current message (pass their file_id to `upload_chat_file` to store one in a file store):',
    ...lines,
  ].join('\n');
}
