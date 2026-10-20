import type { TAttachment, TFile } from 'librechat-data-provider';

export type MessageDownload = {
  fileId: string;
  filename: string;
  filepath: string;
  user?: string;
  source?: string;
  originalFilename?: string;
};

function localReference(href: string): string | null {
  const value = href.replace(/^sandbox:/i, '');
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return null;
  try {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]).replace(/\\/g, '/');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return null;
    if (/[\u0000-\u001f]/.test(path) || path.split('/').includes('..')) return null;
    return path.replace(/^\.\//, '');
  } catch {
    return null;
  }
}

/** Resolve only files attached to this response. Ambiguous names never select a file. */
export function resolveMessageDownload(
  href: string,
  attachments: TAttachment[],
): MessageDownload | null {
  const files = new Map<string, MessageDownload>();
  for (const attachment of attachments) {
    const file = attachment as Partial<TFile>;
    if (file.file_id && file.filename && file.filepath) {
      files.set(file.file_id, {
        fileId: file.file_id,
        filename: file.filename,
        filepath: file.filepath,
        user: file.user,
        source: file.source,
        originalFilename: file.metadata?.originalFilename,
      });
    }
  }
  const exact = [...files.values()].filter((file) => file.filepath === href);
  if (exact.length === 1) return exact[0];
  const reference = localReference(href);
  if (!reference) return null;
  const originalMatches = [...files.values()].filter((file) => file.originalFilename === reference);
  if (originalMatches.length === 1) return originalMatches[0];
  if (originalMatches.length > 1) return null;
  const fullMatches = [...files.values()].filter((file) =>
    file.filename.replace(/\\/g, '/') === reference ||
    localReference(file.filepath) === reference,
  );
  if (fullMatches.length === 1) return fullMatches[0];
  if (fullMatches.length > 1) return null;
  const basename = reference.split('/').pop();
  const originalBasenames = [...files.values()].filter((file) => file.originalFilename === basename);
  if (originalBasenames.length === 1) return originalBasenames[0];
  if (originalBasenames.length > 1) return null;
  const matches = [...files.values()].filter((file) =>
    file.filename.replace(/\\/g, '/').split('/').pop() === basename,
  );
  return matches.length === 1 ? matches[0] : null;
}
