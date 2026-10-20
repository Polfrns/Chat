import { useEffect, useRef } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants } from 'librechat-data-provider';
import {
  useCreateSessionMutation,
  useUpdateSessionMutation,
  useAssignChatToSessionMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Keeps every chat bound to a session. Eager creation happens at submit time
 * (see useSubmitMessage) so the very first message of a new chat already carries
 * its sessionId and gets the leedeo-filestore tools. This hook handles the rest
 * reactively: once a real conversationId exists it assigns the chat to its
 * session in the DB (so the binding survives a reload), creates one as a fallback
 * if a persisted chat somehow still has none, and renames the session to the chat
 * title once it's generated.
 */
export default function useEnsureChatSession(index = 0) {
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(index));
  const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const create = useCreateSessionMutation();
  const assign = useAssignChatToSessionMutation();
  const update = useUpdateSessionMutation();

  /** conversationIds whose DB binding has been handled (assigned or creating). */
  const handledRef = useRef<Set<string>>(new Set());
  const namedRef = useRef<Set<string>>(new Set());

  const conversationId = conversation?.conversationId ?? null;
  const sessionId = conversation?.sessionId ?? null;
  const title = conversation?.title?.trim() ?? '';

  useEffect(() => {
    if (!conversationId || conversationId === Constants.NEW_CONVO) {
      return;
    }
    if (handledRef.current.has(conversationId)) {
      return;
    }
    if (sessionId) {
      handledRef.current.add(conversationId);
      assign.mutate(
        { conversationId, sessionId },
        { onError: () => handledRef.current.delete(conversationId) },
      );
      return;
    }
    /** Fallback: a persisted chat reached a real id with no session (created
     *  outside the submit path). Wait for the turn to finish so the assign
     *  doesn't race the conversation's DB write. */
    if (isSubmitting) {
      return;
    }
    handledRef.current.add(conversationId);
    create.mutate(
      { name: title || localize('com_ui_new_chat') },
      {
        onSuccess: (session) => {
          if (title) {
            namedRef.current.add(session._id);
          }
          setConversation((prev) =>
            prev && prev.conversationId === conversationId
              ? { ...prev, sessionId: session._id }
              : prev,
          );
          assign.mutate({ conversationId, sessionId: session._id });
        },
        onError: () => handledRef.current.delete(conversationId),
      },
    );
  }, [conversationId, sessionId, isSubmitting, title, create, assign, setConversation, localize]);

  useEffect(() => {
    if (!sessionId || !title || namedRef.current.has(sessionId)) {
      return;
    }
    namedRef.current.add(sessionId);
    update.mutate({ id: sessionId, data: { name: title } });
  }, [sessionId, title, update]);
}
