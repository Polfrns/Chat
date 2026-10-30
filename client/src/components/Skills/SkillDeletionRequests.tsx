import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import { useSkillDeletionRequestsQuery, useDecideSkillDeletionMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

/**
 * Always-mounted confirmation for skill deletions requested by the chat model.
 * The `skill_library` tool blocks until the user decides here; closing the
 * dialog keeps the skill.
 */
export default function SkillDeletionRequests() {
  const localize = useLocalize();
  const { data } = useSkillDeletionRequestsQuery();
  const decide = useDecideSkillDeletionMutation();
  const pending = data?.requests[0];

  if (!pending) {
    return null;
  }

  const answer = (approve: boolean) => decide.mutate({ requestId: pending.requestId, approve });

  return (
    <OGDialog open onOpenChange={(open) => !open && !decide.isLoading && answer(false)}>
      <OGDialogContent className="w-11/12 max-w-md overflow-hidden bg-surface-primary text-text-primary">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_roko_skill_delete_title')}</OGDialogTitle>
        </OGDialogHeader>
        <p className="text-xs text-text-secondary">{localize('com_roko_skill_delete_desc')}</p>
        <div className="mt-2 rounded border border-border-light px-3 py-2">
          <div className="break-all text-sm font-semibold">{pending.name}</div>
          {pending.description ? (
            <div className="mt-1 break-words text-xs text-text-secondary">
              {pending.description}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1 text-sm text-text-secondary hover:bg-surface-hover"
            disabled={decide.isLoading}
            onClick={() => answer(false)}
          >
            {localize('com_roko_skill_delete_keep')}
          </button>
          <button
            type="button"
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            disabled={decide.isLoading}
            onClick={() => answer(true)}
          >
            {localize('com_roko_skill_delete_confirm')}
          </button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
