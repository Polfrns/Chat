import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Plus, Trash2 } from 'lucide-react';
import { OGDialog, OGDialogTemplate, Label } from '@librechat/client';
import type { TFilestore } from 'librechat-data-provider';
import { useFilestoresQuery, useDeleteFilestoreMutation } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import FilestoreCreateDialog from './FilestoreCreateDialog';
import FilestoreDialog from './FilestoreDialog';
import FilestoreIcon from './FilestoreIcon';
import store from '~/store';

function FilestoreListItem({ filestore, onOpen }: { filestore: TFilestore; onOpen: () => void }) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const remove = useDeleteFilestoreMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canManage = filestore.owner === user?.id || user?.role === 'ADMIN';
  /** Only ephemeral stores (provisioned via LibreChat) are user-deletable; registered
   *  ones are admin-managed fixtures the service refuses to delete (403). */
  const canDelete = canManage && filestore.ephemeral === true;

  return (
    <li className="list-none">
      <div className="group flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm text-text-primary transition-colors hover:bg-surface-active-alt">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <FilestoreIcon className="shrink-0" />
          <span className="truncate">{filestore.displayName}</span>
        </button>
        {filestore.shared ? (
          <span className="shrink-0 text-[10px] uppercase text-text-secondary">
            {localize('com_roko_shared')}
          </span>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            aria-label={localize('com_roko_delete_filestore')}
            className="shrink-0 text-text-secondary opacity-0 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

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
              remove.mutate(filestore.uid, { onSuccess: () => setConfirmDelete(false) }),
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </li>
  );
}

/**
 * Expanded-sidebar panel (selected via the Filestores icon): CRUD file stores.
 * Each shows as a DB icon; click opens the edit-properties popup, with an inline
 * delete (confirmed) on hover.
 */
export default function FilestoresPanel() {
  const localize = useLocalize();
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  /** Poll while a turn runs so a store the agent creates mid-stream (the
   *  create_filestore hook) appears live, not only at turn end. */
  const { data } = useFilestoresQuery(undefined, {
    refetchInterval: isSubmitting ? 3000 : false,
    refetchIntervalInBackground: true,
  });
  const [active, setActive] = useState<TFilestore | null>(null);
  const [creating, setCreating] = useState(false);

  const filestores = data?.filestores ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pb-3 pt-2">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-sm font-semibold text-text-primary">
          {localize('com_roko_filestores')}
        </span>
        <button
          type="button"
          aria-label={localize('com_roko_new_filestore')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto px-2">
        {filestores.map((fs) => (
          <FilestoreListItem key={fs.uid} filestore={fs} onOpen={() => setActive(fs)} />
        ))}
        {filestores.length === 0 ? (
          <li className="px-2 py-2 text-xs text-text-secondary">
            {localize('com_roko_no_filestores')}
          </li>
        ) : null}
      </ul>

      {active ? (
        <FilestoreDialog
          filestore={active}
          open={Boolean(active)}
          onOpenChange={(o) => !o && setActive(null)}
        />
      ) : null}

      <FilestoreCreateDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
