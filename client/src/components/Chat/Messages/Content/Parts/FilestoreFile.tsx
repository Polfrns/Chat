import { memo } from 'react';
import { Download, FileText } from 'lucide-react';
import type { TAttachment, TAttachmentMetadata, TFile } from 'librechat-data-provider';
import { useAttachmentLink } from './LogLink';
import { useLocalize } from '~/hooks';
import AttachmentPreview from './AttachmentPreview';

const formatBytes = (bytes?: number): string | null => {
  if (bytes == null || Number.isNaN(bytes)) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * A file the assistant delivered from a filestore: a large square button
 * (artifact-card sized) that downloads the file on click.
 */
const FilestoreFile = memo(({ attachment }: { attachment: TAttachment }) => {
  const localize = useLocalize();
  const file = attachment as TFile & TAttachmentMetadata;
  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });
  const size = formatBytes(file.bytes);

  return (
    <div className="inline-flex items-center">
    <button
      type="button"
      onClick={handleDownload}
      aria-label={`${localize('com_ui_download')} ${attachment.filename ?? ''}`}
      className="group relative my-2 flex aspect-square w-40 flex-col items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-tertiary p-3 text-text-primary shadow-sm transition-colors hover:border-border-heavy hover:bg-surface-hover"
    >
      <span className="relative">
        <FileText
          className="h-10 w-10 text-text-secondary transition-opacity group-hover:opacity-0"
          aria-hidden="true"
        />
        <Download
          className="absolute inset-0 m-auto h-10 w-10 text-text-primary opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </span>
      <span className="line-clamp-2 w-full break-all text-center text-xs font-medium">
        {attachment.filename}
      </span>
      <span className="text-[10px] text-text-secondary">
        {size ? `${size} · ` : ''}
        {localize('com_ui_download')}
      </span>
    </button>
    <AttachmentPreview attachment={attachment} />
    </div>
  );
});

FilestoreFile.displayName = 'FilestoreFile';
export default FilestoreFile;
