export type FilePreviewKind = 'pdf' | 'text' | 'image' | 'audio' | 'video';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml',
  'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'py',
  'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'sh', 'ps1', 'sql',
  'log', 'ini', 'toml', 'r', 'vue', 'svelte', 'tex', 'diff', 'patch',
]);
const NATIVE_PREVIEWS: Record<string, FilePreviewKind> = {
  pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', avif: 'image', bmp: 'image', svg: 'image', ico: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio',
  aac: 'audio', flac: 'audio', mp4: 'video', webm: 'video', ogv: 'video', mov: 'video',
};

export function getFilePreviewKind(filename: string, mimeType?: string): FilePreviewKind | null {
  const mime = mimeType?.split(';', 1)[0].trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('text/') || /^(?:application\/(?:json|xml|javascript|x-javascript|yaml|x-yaml|x-ndjson))$/.test(mime ?? '')) return 'text';
  const extension = filename.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  if (Object.hasOwn(NATIVE_PREVIEWS, extension)) return NATIVE_PREVIEWS[extension];
  return TEXT_EXTENSIONS.has(extension) ? 'text' : null;
}
