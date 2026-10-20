import { useState } from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import { useFilestoresQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import FilestoreCreateDialog from './FilestoreCreateDialog';
import FilestoreIcon from './FilestoreIcon';

/**
 * Reusable filestore picker. Lists the user's accessible filestores (own +
 * shared), excluding `excludeUids`, and opens the "new filestore" popup to create
 * one (then auto-picks it). Calls `onPick(filestoreUid)` when one is chosen.
 */
export default function FilestoreExplorerDialog({
  open,
  onOpenChange,
  excludeUids = [],
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeUids?: string[];
  onPick: (filestoreUid: string) => void;
}) {
  const localize = useLocalize();
  const { data } = useFilestoresQuery();
  const [creating, setCreating] = useState(false);

  const excluded = new Set(excludeUids);
  const available = (data?.filestores ?? []).filter((fs) => !excluded.has(fs.uid));

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_roko_attach_filestore')}</OGDialogTitle>
        </OGDialogHeader>

        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {available.map((fs) => (
            <li key={fs.uid}>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                onClick={() => onPick(fs.uid)}
              >
                <FilestoreIcon />
                <span className="truncate">{fs.displayName}</span>
                <span className="ml-auto text-xs text-text-secondary">
                  {fs.shared ? localize('com_roko_shared') : localize('com_roko_private')}
                </span>
              </button>
            </li>
          ))}
          {available.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-text-secondary">
              {localize('com_roko_no_filestores')}
            </li>
          ) : null}
        </ul>

        <button
          className="mt-2 self-start text-sm text-text-secondary hover:text-text-primary"
          onClick={() => setCreating(true)}
        >
          {localize('com_roko_new_filestore')}
        </button>

        <FilestoreCreateDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={(fs) => onPick(fs.uid)}
        />
      </OGDialogContent>
    </OGDialog>
  );
}
