import { useState, useEffect, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import {
  useFilestoreAccessRequestsQuery,
  useDecideFilestoreAccessRequestMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { FilestoreIcon } from '~/components/Filestores';
import store from '~/store';

/**
 * Always-mounted approval popup for the current chat's session. When the LLM's
 * `add_filestores` tool raises pending access requests (surfaced by a polling
 * query), the user ticks the file stores to grant and confirms; checked ones are
 * approved (attached to the session) and the rest are denied. Either way the
 * decision is fed back to the (blocked) tool so the assistant continues.
 */
export default function FilestoreAccessRequests() {
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const sessionId = conversation?.sessionId ?? null;
  const { data } = useFilestoreAccessRequestsQuery(sessionId);
  const decide = useDecideFilestoreAccessRequestMutation(sessionId ?? '');

  const requests = useMemo(() => data?.requests ?? [], [data]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const req of requests) {
        next[req.filestoreUid] = prev[req.filestoreUid] ?? true;
      }
      return next;
    });
  }, [requests]);

  if (!sessionId || requests.length === 0) {
    return null;
  }

  const resolveAll = (approveChecked: boolean) =>
    requests.forEach((req) =>
      decide.mutate({
        filestoreUid: req.filestoreUid,
        decision: approveChecked && checked[req.filestoreUid] ? 'approve' : 'deny',
      }),
    );

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <OGDialog open onOpenChange={(open) => !open && resolveAll(false)}>
      <OGDialogContent className="w-11/12 max-w-md overflow-hidden bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_roko_access_request_title')}</OGDialogTitle>
        </OGDialogHeader>
        <p className="text-xs text-text-secondary">{localize('com_roko_access_request_desc')}</p>
        <ul className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {requests.map((req) => (
            <li key={req.filestoreUid}>
              <label className="flex w-full cursor-pointer items-start gap-2 rounded border border-border-light px-2 py-1.5">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={checked[req.filestoreUid] ?? true}
                  onChange={() => toggle(req.filestoreUid)}
                />
                <FilestoreIcon className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{req.displayName}</div>
                  {req.reason ? (
                    <div className="break-words text-xs text-text-secondary">
                      {localize('com_roko_access_reason')}: {req.reason}
                    </div>
                  ) : null}
                </div>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1 text-sm text-text-secondary hover:bg-surface-hover"
            disabled={decide.isLoading}
            onClick={() => resolveAll(false)}
          >
            {localize('com_roko_deny_all')}
          </button>
          <button
            type="button"
            className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            disabled={decide.isLoading}
            onClick={() => resolveAll(true)}
          >
            {localize('com_roko_confirm_access')}
          </button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
