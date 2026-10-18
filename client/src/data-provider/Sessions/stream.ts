import { useEffect } from 'react';
import { SSE } from 'sse.js';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, filestoreRequestsStream } from 'librechat-data-provider';
import type { TFilestoreAccessRequest, TFilestoreCreationRequest } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

interface FilestoreRequestsEvent {
  accessRequests: TFilestoreAccessRequest[];
  creationRequests: TFilestoreCreationRequest[];
}

const RECONNECT_MS = 3000;

/**
 * Subscribe to the session's request SSE stream and mirror each pushed snapshot
 * into the React Query caches the approval/creation dialogs read, so the popups
 * surface promptly while the (blocked) tool waits. The underlying queries keep a
 * slow poll only as a backstop for when the stream can't connect.
 */
export function useFilestoreRequestsStream(sessionId?: string | null): void {
  const queryClient = useQueryClient();
  const { token } = useAuthContext();

  useEffect(() => {
    if (!sessionId || !token) {
      return;
    }
    let closed = false;
    let sse: SSE | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;

    const open = (): void => {
      if (closed) {
        return;
      }
      /** Single-flight: drop any pending reconnect and existing socket so rapid
       *  repeated errors can't stack timers into duplicate connections. */
      if (reconnect) {
        clearTimeout(reconnect);
        reconnect = null;
      }
      if (sse) {
        sse.close();
      }
      sse = new SSE(filestoreRequestsStream(sessionId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      sse.addEventListener('requests', (e: MessageEvent) => {
        const data: FilestoreRequestsEvent = JSON.parse(e.data);
        queryClient.setQueryData([QueryKeys.filestoreAccessRequests, sessionId], {
          requests: data.accessRequests,
        });
        queryClient.setQueryData([QueryKeys.filestoreCreationRequests, sessionId], {
          requests: data.creationRequests,
        });
      });
      sse.addEventListener('error', () => {
        sse?.close();
        if (!closed) {
          reconnect = setTimeout(open, RECONNECT_MS);
        }
      });
      sse.stream();
    };

    open();

    return () => {
      closed = true;
      if (reconnect) {
        clearTimeout(reconnect);
      }
      sse?.close();
    };
  }, [sessionId, token, queryClient]);
}
