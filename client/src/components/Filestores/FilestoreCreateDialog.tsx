import { useState, useEffect } from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import type { TFilestore } from 'librechat-data-provider';
import { useCreateFilestoreMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import FilestoreIcon from './FilestoreIcon';

/**
 * The "new filestore" popup: collect name, description, shared and read-only
 * before creating. Shared everywhere a filestore is created (panel "+" button
 * and the attach-filestore explorer) so a store is never created untitled.
 */
export default function FilestoreCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (filestore: TFilestore) => void;
}) {
  const localize = useLocalize();
  const create = useCreateFilestoreMutation();

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName('');
      setDescription('');
      setShared(false);
      setReadOnly(false);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      return;
    }
    const filestore = await create.mutateAsync({
      displayName: trimmed,
      description: description.trim() || undefined,
      shared,
      readOnly,
    });
    onOpenChange(false);
    onCreated?.(filestore);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle className="flex items-center gap-2">
            <FilestoreIcon className="h-5 w-5" />
            {localize('com_roko_new_filestore')}
          </OGDialogTitle>
        </OGDialogHeader>

        <div className="flex flex-col gap-3">
          <input
            className="rounded border border-border-light bg-transparent px-2 py-1 text-sm"
            placeholder={localize('com_roko_filestore_name')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label={localize('com_roko_filestore_name')}
          />
          <textarea
            className="min-h-16 rounded border border-border-light bg-transparent px-2 py-1 text-sm"
            placeholder={localize('com_roko_filestore_description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label={localize('com_roko_filestore_description')}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            {localize('com_roko_filestore_shared')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            {localize('com_roko_filestore_readonly')}
          </label>
          <button
            className="self-start rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            disabled={!displayName.trim() || create.isLoading}
            onClick={submit}
          >
            {localize('com_roko_create_filestore')}
          </button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
