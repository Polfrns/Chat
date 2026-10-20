import { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { PanelRightOpen, PanelRightClose, X, Plus, ChevronRight } from 'lucide-react';
import { OGDialog, OGDialogTemplate, Label } from '@librechat/client';
import type { TFilestore } from 'librechat-data-provider';
import {
  useSessionQuery,
  useSessionFilestoresQuery,
  useUpdateSessionMutation,
  useAttachSessionFilestoreMutation,
  useDetachSessionFilestoreMutation,
} from '~/data-provider';
import { useLocalize, useLocalStorage } from '~/hooks';
import { FilestoreIcon, FilestoreExplorerDialog, FilestoreTree } from '~/components/Filestores';
import { cn } from '~/utils';
import store from '~/store';

function SessionFilestoreItem({
  filestore,
  onDetach,
}: {
  filestore: TFilestore;
  onDetach: () => void;
}) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded border border-border-light">
      <div className="flex items-center gap-1.5 px-2 py-1 text-sm">
        <button
          type="button"
          aria-label={localize('com_roko_files')}
          aria-expanded={expanded}
          onClick={() => setExpanded((p) => !p)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform',
              expanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <FilestoreIcon className="shrink-0" />
          <span className="truncate">{filestore.displayName}</span>
        </button>
        <button
          type="button"
          aria-label={localize('com_roko_detach')}
          className="shrink-0 text-text-secondary hover:text-red-500"
          onClick={onDetach}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {expanded ? (
        <div className="border-t border-border-light px-1 py-1">
          <FilestoreTree
            filestoreUid={filestore.uid}
            active={expanded}
            readOnly={filestore.readOnly}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Always-present, collapsible right sidebar reflecting the CURRENT chat's
 * session: edit its name and manage its filestores (list / remove / add via the
 * filestore explorer). Empty hint when the active chat has no session.
 */
export default function SessionSidebar() {
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const sessionId = conversation?.sessionId ?? null;

  const [collapsed, setCollapsed] = useLocalStorage('sessionSidebarCollapsed', false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [pendingDetach, setPendingDetach] = useState<string | null>(null);

  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const { data: session } = useSessionQuery(sessionId);
  /** While a turn is running the agent may attach/create stores mid-stream (the
   *  hooks), so poll to reflect the list live, not only at turn end. */
  const { data: filestoresData } = useSessionFilestoresQuery(sessionId, {
    refetchInterval: isSubmitting ? 3000 : false,
    refetchIntervalInBackground: true,
  });
  const update = useUpdateSessionMutation();
  const attach = useAttachSessionFilestoreMutation(sessionId ?? '');
  const detach = useDetachSessionFilestoreMutation(sessionId ?? '');

  const [name, setName] = useState('');
  useEffect(() => {
    setName(session?.name ?? '');
  }, [session?.name]);

  const filestores = filestoresData?.filestores ?? [];

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label={localize('com_roko_session_panel')}
        onClick={() => setCollapsed(false)}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border-light bg-surface-primary">
      <div className="flex items-center justify-between border-b border-border-light px-3 py-2">
        <span className="text-sm font-semibold text-text-primary">
          {localize('com_roko_session_panel')}
        </span>
        <button
          type="button"
          aria-label={localize('com_ui_collapse')}
          onClick={() => setCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <PanelRightClose className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {!sessionId || !session ? (
        <p className="px-3 py-4 text-xs text-text-secondary">
          {localize('com_roko_no_session_for_chat')}
        </p>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {localize('com_roko_session_name')}
            </label>
            <input
              className="w-full rounded border border-border-light bg-transparent px-2 py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== session.name) {
                  update.mutate({ id: session._id, data: { name: trimmed } });
                }
              }}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                {localize('com_roko_filestores')}
              </span>
              <button
                type="button"
                aria-label={localize('com_roko_attach_filestore')}
                className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={() => setExplorerOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {filestores.map((fs) => (
                <SessionFilestoreItem
                  key={fs.uid}
                  filestore={fs}
                  onDetach={() => setPendingDetach(fs.uid)}
                />
              ))}
              {filestores.length === 0 ? (
                <li className="text-xs text-text-secondary">
                  {localize('com_roko_no_filestores')}
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      )}

      {sessionId ? (
        <FilestoreExplorerDialog
          open={explorerOpen}
          onOpenChange={setExplorerOpen}
          excludeUids={filestores.map((fs) => fs.uid)}
          onPick={(filestoreUid) => {
            attach.mutate(filestoreUid);
            setExplorerOpen(false);
          }}
        />
      ) : null}

      <OGDialog open={pendingDetach != null} onOpenChange={(o) => !o && setPendingDetach(null)}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_roko_detach')}
          className="w-11/12 max-w-md"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_roko_detach_confirm')}
            </Label>
          }
          selection={{
            selectHandler: () => {
              if (pendingDetach) {
                detach.mutate(pendingDetach);
              }
              setPendingDetach(null);
            },
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_roko_detach'),
          }}
        />
      </OGDialog>
    </aside>
  );
}
