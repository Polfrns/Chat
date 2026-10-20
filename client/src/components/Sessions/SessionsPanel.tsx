import { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, MessageSquarePlus, Trash2 } from 'lucide-react';
import { OGDialog, OGDialogTemplate, Label } from '@librechat/client';
import { QueryKeys } from 'librechat-data-provider';
import type { TSession, TConversation } from 'librechat-data-provider';
import {
  useSessionsQuery,
  useSessionChatsQuery,
  useDeleteSessionMutation,
  useDeleteConversationMutation,
} from '~/data-provider';
import { useLocalize, useNewConvo, useNavigateToConvo } from '~/hooks';
import SessionCreateDialog from './SessionCreateDialog';
import { FilestoreIcon } from '~/components/Filestores';
import { cn } from '~/utils';
import store from '~/store';

function SessionChatItem({
  chat,
  sessionId,
  activeConversationId,
}: {
  chat: TConversation;
  sessionId: string;
  activeConversationId?: string | null;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { navigateToConvo } = useNavigateToConvo();
  const { newConversation } = useNewConvo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isActive = chat.conversationId === activeConversationId;
  const title = chat.title || localize('com_ui_new_chat');

  const del = useDeleteConversationMutation({
    onSuccess: () => {
      setConfirmDelete(false);
      queryClient.invalidateQueries([QueryKeys.sessionChats, sessionId]);
      queryClient.invalidateQueries([QueryKeys.sessions]);
      if (isActive) {
        newConversation();
      }
    },
  });

  return (
    <div className="group flex items-center gap-1 rounded pr-1 hover:bg-surface-hover">
      <button
        type="button"
        onClick={() => navigateToConvo(chat, { currentConvoId: activeConversationId ?? undefined })}
        className={cn(
          'min-w-0 flex-1 truncate px-2 py-1 text-left text-xs hover:text-text-primary',
          isActive ? 'font-medium text-text-primary' : 'text-text-secondary',
        )}
      >
        {title}
      </button>
      <button
        type="button"
        aria-label={localize('com_roko_delete_chat')}
        className="shrink-0 text-text-secondary opacity-0 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
      </button>

      <OGDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_roko_delete_chat')}
          className="w-11/12 max-w-md"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_roko_delete_chat_confirm', { 0: title })}
            </Label>
          }
          selection={{
            selectHandler: () => {
              if (chat.conversationId) {
                del.mutate({ conversationId: chat.conversationId });
              }
            },
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}

function SessionChats({
  session,
  activeConversationId,
}: {
  session: TSession;
  activeConversationId?: string | null;
}) {
  const localize = useLocalize();
  const { newConversation } = useNewConvo();
  const { data } = useSessionChatsQuery(session._id);
  const chats = (data?.chats ?? []) as TConversation[];

  return (
    <div className="ml-5 flex flex-col gap-0.5 py-1">
      {chats.map((chat) => (
        <SessionChatItem
          key={chat.conversationId}
          chat={chat}
          sessionId={session._id}
          activeConversationId={activeConversationId}
        />
      ))}
      <button
        type="button"
        onClick={() => newConversation({ template: { sessionId: session._id } })}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
        {localize('com_roko_new_chat_in_session')}
      </button>
    </div>
  );
}

function SessionItem({
  session,
  activeSessionId,
  activeConversationId,
}: {
  session: TSession;
  activeSessionId?: string | null;
  activeConversationId?: string | null;
}) {
  const localize = useLocalize();
  const { newConversation } = useNewConvo();
  const isActive = session._id === activeSessionId;
  const [expanded, setExpanded] = useState(isActive);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteSessionMutation();

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  return (
    <li className="list-none">
      <div
        className={cn(
          'group flex h-9 w-full items-center gap-1.5 rounded-lg px-2 text-sm transition-colors hover:bg-surface-active-alt',
          isActive ? 'bg-surface-active-alt font-medium text-text-primary' : 'text-text-primary',
        )}
      >
        <button
          type="button"
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
          <span className="truncate">{session.name}</span>
        </button>
        {session.filestoreUids.length > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-text-secondary">
            <FilestoreIcon className="h-3 w-3" />
            {session.filestoreUids.length}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={localize('com_roko_delete_session')}
          className="shrink-0 text-text-secondary opacity-0 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {expanded ? (
        <SessionChats session={session} activeConversationId={activeConversationId} />
      ) : null}

      <OGDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_roko_delete_session')}
          className="w-11/12 max-w-md"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_roko_delete_session_confirm', { 0: session.name })}
            </Label>
          }
          selection={{
            selectHandler: () =>
              remove.mutate(session._id, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  if (isActive) {
                    newConversation();
                  }
                },
              }),
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
 * Expanded-sidebar panel (selected via the Sessions icon): the native way to
 * browse/create sessions and create/select the chats within them. The active
 * chat's session auto-expands and its conversation is highlighted.
 */
export default function SessionsPanel() {
  const localize = useLocalize();
  const { data } = useSessionsQuery();
  const [creating, setCreating] = useState(false);
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const sessions = data?.sessions ?? [];
  const activeSessionId = conversation?.sessionId ?? null;
  const activeConversationId = conversation?.conversationId ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pb-3 pt-2">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-sm font-semibold text-text-primary">
          {localize('com_roko_sessions')}
        </span>
        <button
          type="button"
          aria-label={localize('com_roko_new_session')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <SessionCreateDialog open={creating} onOpenChange={setCreating} />

      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto px-2">
        {sessions.map((session) => (
          <SessionItem
            key={session._id}
            session={session}
            activeSessionId={activeSessionId}
            activeConversationId={activeConversationId}
          />
        ))}
        {sessions.length === 0 ? (
          <li className="px-2 py-2 text-xs text-text-secondary">
            {localize('com_roko_no_sessions')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
