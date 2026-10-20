import { useState } from 'react';
import { Eye } from 'lucide-react';
import type { TFile, TAttachment, TAttachmentMetadata } from 'librechat-data-provider';
import FilePreviewDialog from '../FilePreviewDialog';
import { getFilePreviewKind } from '~/utils/filePreview';
import { useLocalize } from '~/hooks';

export default function AttachmentPreview({ attachment }: { attachment: Partial<TAttachment> }) {
  const [open, setOpen] = useState(false);
  const localize = useLocalize();
  const file = attachment as Partial<TFile & TAttachmentMetadata>;
  const hasPreview = getFilePreviewKind(file.filename ?? '', file.type) || typeof file.text === 'string';
  if (!file.file_id || !hasPreview) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${localize('com_ui_preview')}: ${file.filename ?? ''}`}
        title={localize('com_ui_preview')}
        className="m-1 self-center rounded-lg p-2 text-text-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-border-heavy"
      >
        <Eye className="size-4" aria-hidden="true" />
      </button>
      <FilePreviewDialog
        open={open}
        onOpenChange={setOpen}
        fileId={file.file_id}
        fileName={file.filename ?? ''}
        fileType={file.type}
        fileSize={file.bytes}
        previewText={file.text}
        previewTextFormat={file.textFormat}
      />
    </>
  );
}
