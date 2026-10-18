import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import { useCreateSessionMutation, useFilestoresQuery } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { FilestoreIcon, FilestoreCreateDialog } from '~/components/Filestores';

/**
 * The "new session" popup: name the session and select its filestores. On
 * creation the session's first chat is started immediately (which also makes the
 * session active, so the Sessions panel auto-expands it).
 */
export default function SessionCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const localize = useLocalize();
  const create = useCreateSessionMutation();
  const { newConversation } = useNewConvo();
  const { data } = useFilestoresQuery();

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creatingFilestore, setCreatingFilestore] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setSelected([]);
    }
  }, [open]);

  const filestores = data?.filestores ?? [];
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    create.mutate(
      { name: trimmed, filestoreUids: selected },
      {
        onSuccess: (session) => {
          onOpenChange(false);
          newConversation({ template: { sessionId: session._id } });
        },
      },
    );
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_roko_new_session')}</OGDialogTitle>
        </OGDialogHeader>

        <div className="flex flex-col gap-3">
          <input
            className="rounded border border-border-light bg-transparent px-2 py-1 text-sm"
            placeholder={localize('com_roko_session_name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={localize('com_roko_session_name')}
          />

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                {localize('com_roko_filestores')}
              </span>
              <button
                type="button"
                aria-label={localize('com_roko_new_filestore')}
                className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={() => setCreatingFilestore(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {filestores.length > 0 ? (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {filestores.map((fs) => (
                  <label key={fs.uid} className="flex items-center gap-2 px-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(fs.uid)}
                      onChange={() => toggle(fs.uid)}
                    />
                    <FilestoreIcon />
                    <span className="truncate">{fs.displayName}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary">{localize('com_roko_no_filestores')}</p>
            )}
          </div>

          <button
            className="self-start rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            disabled={!name.trim() || create.isLoading}
            onClick={submit}
          >
            {localize('com_roko_create_session')}
          </button>
        </div>

        <FilestoreCreateDialog
          open={creatingFilestore}
          onOpenChange={setCreatingFilestore}
          onCreated={(fs) => setSelected((prev) => Array.from(new Set([...prev, fs.uid])))}
        />
      </OGDialogContent>
    </OGDialog>
  );
}
