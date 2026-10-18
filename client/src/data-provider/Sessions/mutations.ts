import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TSession,
  TCreateSessionRequest,
  TUpdateSessionRequest,
  TDeleteCountResponse,
  TFilestoreAccessDecision,
  TFilestoreCreationDecision,
  TFilestoreCreationProposal,
} from 'librechat-data-provider';

export const useCreateSessionMutation = (): UseMutationResult<
  TSession,
  unknown,
  TCreateSessionRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TCreateSessionRequest) => dataService.createSession(payload), {
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.sessions]),
  });
};

export const useUpdateSessionMutation = (): UseMutationResult<
  TSession,
  unknown,
  { id: string; data: TUpdateSessionRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(({ id, data }) => dataService.updateSession(id, data), {
    onSuccess: (session) => {
      queryClient.setQueryData([QueryKeys.session, session._id], session);
      queryClient.invalidateQueries([QueryKeys.sessions]);
      queryClient.invalidateQueries([QueryKeys.sessionFilestores, session._id]);
    },
  });
};

export const useDeleteSessionMutation = (): UseMutationResult<
  TDeleteCountResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((id: string) => dataService.deleteSession(id), {
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries([QueryKeys.sessions]);
      /** Deleting a session cascades to its chats (+ messages). */
      queryClient.invalidateQueries([QueryKeys.sessionChats, id]);
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};

export const useAttachSessionFilestoreMutation = (
  sessionId: string,
): UseMutationResult<TSession, unknown, string, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (filestoreUid: string) => dataService.attachSessionFilestore(sessionId, filestoreUid),
    {
      onSuccess: (session) => {
        queryClient.setQueryData([QueryKeys.session, sessionId], session);
        queryClient.invalidateQueries([QueryKeys.sessionFilestores, sessionId]);
      },
    },
  );
};

export const useDetachSessionFilestoreMutation = (
  sessionId: string,
): UseMutationResult<TSession, unknown, string, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (filestoreUid: string) => dataService.detachSessionFilestore(sessionId, filestoreUid),
    {
      onSuccess: (session) => {
        queryClient.setQueryData([QueryKeys.session, sessionId], session);
        queryClient.invalidateQueries([QueryKeys.sessionFilestores, sessionId]);
      },
    },
  );
};

export const useDecideFilestoreAccessRequestMutation = (
  sessionId: string,
): UseMutationResult<
  TSession,
  unknown,
  { filestoreUid: string; decision: TFilestoreAccessDecision },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ filestoreUid, decision }) =>
      dataService.decideFilestoreAccessRequest(sessionId, filestoreUid, decision),
    {
      onSuccess: (session) => {
        queryClient.setQueryData([QueryKeys.session, sessionId], session);
        queryClient.invalidateQueries([QueryKeys.sessionFilestores, sessionId]);
        queryClient.invalidateQueries([QueryKeys.filestoreAccessRequests, sessionId]);
      },
    },
  );
};

export const useAssignChatToSessionMutation = (): UseMutationResult<
  { conversationId: string },
  unknown,
  { conversationId: string; sessionId: string | null },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ conversationId, sessionId }) => dataService.assignChatToSession(conversationId, sessionId),
    {
      onSuccess: (_data, { sessionId }) => {
        queryClient.invalidateQueries([QueryKeys.sessions]);
        if (sessionId) {
          queryClient.invalidateQueries([QueryKeys.sessionChats, sessionId]);
        }
      },
    },
  );
};

export const useDecideFilestoreCreationRequestMutation = (
  sessionId: string,
): UseMutationResult<
  { ok: boolean },
  unknown,
  { requestId: string; decision: TFilestoreCreationDecision; values?: TFilestoreCreationProposal },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ requestId, decision, values }) =>
      dataService.decideFilestoreCreationRequest(sessionId, requestId, decision, values),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.filestoreCreationRequests, sessionId]);
        /** A confirmed creation is attached to the session by the hook. */
        queryClient.invalidateQueries([QueryKeys.sessionFilestores, sessionId]);
        queryClient.invalidateQueries([QueryKeys.filestores]);
      },
    },
  );
};
