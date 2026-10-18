import { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import {
  useFilestoreCreationRequestsQuery,
  useDecideFilestoreCreationRequestMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { FilestoreIcon } from '~/components/Filestores';
import store from '~/store';

/**
 * Always-mounted confirmation for the current chat's session. When the agent's
 * `create_filestore` hook proposes a store (surfaced by a polling query), this
 * pre-fills the same create form with the model's proposed details; the user may
 * edit and confirm, or decline. The decision (with any edits) is fed back to the
 * blocked tool call so creation proceeds with the user's final values — or is
 * cancelled. Dismissing the dialog declines.
 */
export default function FilestoreCreationRequestDialog() {
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const sessionId = conversation?.sessionId ?? null;
  const { data } = useFilestoreCreationRequestsQuery(sessionId);
  const decide = useDecideFilestoreCreationRequestMutation(sessionId ?? '');

  const current = data?.requests?.[0] ?? null;

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [shared, setShared] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (current) {
      setDisplayName(current.proposed.displayName);
      setDescription(current.proposed.description);
      setShared(current.proposed.shared);
      setReadOnly(current.proposed.readOnly);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.requestId]);

  if (!sessionId || !current) {
    return null;
  }

  const confirm = () =>
    decide.mutate({
      requestId: current.requestId,
      decision: 'confirm',
      values: {
        displayName: displayName.trim(),
        description: description.trim(),
        shared,
        readOnly,
      },
    });
  const decline = () => decide.mutate({ requestId: current.requestId, decision: 'decline' });

  return (
    <OGDialog open onOpenChange={(open) => !open && decline()}>
      <OGDialogContent className="w-11/12 max-w-md overflow-hidden bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle className="flex items-center gap-2">
            <FilestoreIcon className="h-5 w-5" />
            {localize('com_roko_create_request_title')}
          </OGDialogTitle>
        </OGDialogHeader>
        <p className="text-xs text-text-secondary">{localize('com_roko_create_request_desc')}</p>

        <div className="mt-2 flex flex-col gap-3">
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
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1 text-sm text-text-secondary hover:bg-surface-hover"
            disabled={decide.isLoading}
            onClick={decline}
          >
            {localize('com_roko_decline')}
          </button>
          <button
            type="button"
            className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            disabled={!displayName.trim() || decide.isLoading}
            onClick={confirm}
          >
            {localize('com_roko_create_filestore')}
          </button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
