import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { replaceSpecialVars } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useCreateSessionMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { mainTextareaId } from '~/common';
import store from '~/store';

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const methods = useChatFormContext();
  const { conversation: addedConvo } = useAddedChatContext();
  const { ask, index, getMessages, setMessages } = useChatContext();
  const latestMessage = useLatestMessage(index);

  const conversation = useRecoilValue(store.conversationByIndex(index));
  const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const createSession = useCreateSessionMutation();
  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    async (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      const text = data.text?.trim();
      if (!text) {
        return;
      }
      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      /**
       * Roko: every chat belongs to a session. Create one synchronously BEFORE
       * the first message of a new chat is sent, so that message already carries
       * the sessionId — which is what makes the backend inject the leedeo-filestore
       * tools on the very first turn (not just the second).
       */
      let overrideSessionId = conversation?.sessionId ?? undefined;
      if (!overrideSessionId) {
        try {
          const session = await createSession.mutateAsync({
            name: text.slice(0, 80) || localize('com_ui_new_chat'),
          });
          overrideSessionId = session._id;
          setConversation((prev) =>
            prev && prev.sessionId == null ? { ...prev, sessionId: session._id } : prev,
          );
        } catch {
          /* Fall through without a session; useEnsureChatSession retries once a
             real conversationId exists. */
        }
      }

      const submitted = ask(
        {
          text: data.text,
        },
        {
          addedConvo: addedConvo ?? undefined,
          overrideSessionId,
        },
      );
      if (submitted === false) {
        return false;
      }
      methods.reset();
    },
    [
      ask,
      methods,
      addedConvo,
      setMessages,
      getMessages,
      latestMessage,
      conversation,
      setConversation,
      createSession,
      localize,
    ],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
      const currentText = textarea?.value ?? methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt };
}
