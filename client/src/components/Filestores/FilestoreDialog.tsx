import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTemplate,
  Label,
} from '@librechat/client';
import type { TFilestore } from 'librechat-data-provider';
import { useUpdateFilestoreMutation, useDeleteFilestoreMutation } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import FilestoreIcon from './FilestoreIcon';

/**
 * The per-filestore popup: edit its properties (name, description, read-only) and
 * delete it. File browsing/uploading lives in the session sidebar tree.
 */
export default function FilestoreDialog({
  filestore,
  open,
  onOpenChange,
}: {
  filestore: TFilestore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const update = useUpdateFilestoreMutation();
  const remove = useDeleteFilestoreMutation();
  const [displayName, setDisplayName] = useState(filestore.displayName);

  const [description, setDescription] = useState(filestore.description ?? '');
  const [readOnly, setReadOnly] = useState(filestore.readOnly);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canManage = filestore.owner === user?.id || user?.role === 'ADMIN';
  /** Only ephemeral stores (provisioned via LibreChat) are user-deletable; registered
   *  ones are admin-managed fixtures the service refuses to delete (403). */
  const canDelete = canManage && filestore.ephemeral === true;

  useEffect(() => {
    if (open) {
      setDisplayName(filestore.displayName);
      setDescription(filestore.description ?? '');
      setReadOnly(filestore.readOnly);
    }
  }, [open, filestore]);

  const save = () => {
    update.mutate({
      id: filestore.uid,
      data: { displayName: displayName.trim(), description, readOnly },
    });
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-lg bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle className="flex items-center gap-2">
            <FilestoreIcon className="h-5 w-5" />
            {filestore.displayName}
            {filestore.shared ? (
              <span className="text-xs text-text-secondary">{localize('com_roko_shared')}</span>
            ) : null}
          </OGDialogTitle>
        </OGDialogHeader>

        <div className="flex flex-col gap-3">
          <input
            className="rounded border border-border-light bg-transparent px-2 py-1 text-sm"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label={localize('com_roko_filestore_name')}
          />
          <textarea
            className="min-h-16 rounded border border-border-light bg-transparent px-2 py-1 text-sm"
            value={description}
            placeholder={localize('com_roko_filestore_description')}
            onChange={(e) => setDescription(e.target.value)}
            aria-label={localize('com_roko_filestore_description')}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            {localize('com_roko_filestore_readonly')}
          </label>
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              disabled={update.isLoading || !displayName.trim()}
              onClick={save}
            >
              {localize('com_ui_save')}
            </button>
            {canDelete ? (
              <button
                type="button"
                aria-label={localize('com_roko_delete_filestore')}
                className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-sm text-red-500 hover:bg-surface-hover"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_delete')}
              </button>
            ) : null}
          </div>
        </div>
      </OGDialogContent>

      <OGDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_roko_delete_filestore')}
          className="w-11/12 max-w-md"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_roko_delete_filestore_confirm')}
            </Label>
          }
          selection={{
            selectHandler: () =>
              remove.mutate(filestore.uid, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  onOpenChange(false);
                },
              }),
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </OGDialog>
  );
}
