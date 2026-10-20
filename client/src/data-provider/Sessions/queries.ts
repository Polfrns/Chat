import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  TSession,
  TSessionListResponse,
  TSessionChatsResponse,
  TSessionFilestoresResponse,
  TFilestoreAccessRequestsResponse,
  TFilestoreCreationRequestsResponse,
} from 'librechat-data-provider';

export const useSessionsQuery = (
  search?: string,
  config?: UseQueryOptions<TSessionListResponse>,
): QueryObserverResult<TSessionListResponse, unknown> => {
  return useQuery<TSessionListResponse>(
    [QueryKeys.sessions, { search }],
    () => dataService.listSessions(search),
    { staleTime: 60 * 1000, refetchOnWindowFocus: false, ...config },
  );
};

export const useSessionQuery = (
  sessionId?: string | null,
  config?: UseQueryOptions<TSession>,
): QueryObserverResult<TSession, unknown> => {
  return useQuery<TSession>(
    [QueryKeys.session, sessionId],
    () => dataService.getSessionById(sessionId ?? ''),
    { enabled: Boolean(sessionId), refetchOnWindowFocus: false, ...config },
  );
};

export const useSessionFilestoresQuery = (
  sessionId?: string | null,
  config?: UseQueryOptions<TSessionFilestoresResponse>,
): QueryObserverResult<TSessionFilestoresResponse, unknown> => {
  return useQuery<TSessionFilestoresResponse>(
    [QueryKeys.sessionFilestores, sessionId],
    () => dataService.listSessionFilestores(sessionId ?? ''),
    { enabled: Boolean(sessionId), refetchOnWindowFocus: false, ...config },
  );
};

export const useSessionChatsQuery = (
  sessionId?: string | null,
  config?: UseQueryOptions<TSessionChatsResponse>,
): QueryObserverResult<TSessionChatsResponse, unknown> => {
  return useQuery<TSessionChatsResponse>(
    [QueryKeys.sessionChats, sessionId],
    () => dataService.listSessionChats(sessionId ?? ''),
    { enabled: Boolean(sessionId), refetchOnWindowFocus: false, ...config },
  );
};

export const useFilestoreAccessRequestsQuery = (
  sessionId?: string | null,
  config?: UseQueryOptions<TFilestoreAccessRequestsResponse>,
): QueryObserverResult<TFilestoreAccessRequestsResponse, unknown> => {
  return useQuery<TFilestoreAccessRequestsResponse>(
    [QueryKeys.filestoreAccessRequests, sessionId],
    () => dataService.listFilestoreAccessRequests(sessionId ?? ''),
    {
      enabled: Boolean(sessionId),
      /** Realtime updates arrive via the session requests SSE stream
       *  (useFilestoreRequestsStream); this slow poll is only a backstop for when
       *  the stream can't connect. */
      refetchInterval: sessionId ? 30000 : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 0,
      ...config,
    },
  );
};

export const useFilestoreCreationRequestsQuery = (
  sessionId?: string | null,
  config?: UseQueryOptions<TFilestoreCreationRequestsResponse>,
): QueryObserverResult<TFilestoreCreationRequestsResponse, unknown> => {
  return useQuery<TFilestoreCreationRequestsResponse>(
    [QueryKeys.filestoreCreationRequests, sessionId],
    () => dataService.listFilestoreCreationRequests(sessionId ?? ''),
    {
      enabled: Boolean(sessionId),
      /** Realtime updates arrive via the session requests SSE stream
       *  (useFilestoreRequestsStream); this slow poll is only a backstop for when
       *  the stream can't connect. */
      refetchInterval: sessionId ? 30000 : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 0,
      ...config,
    },
  );
};
