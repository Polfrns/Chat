import { useRecoilValue } from 'recoil';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, apiBaseUrl, request } from 'librechat-data-provider';
import store from '~/store';

/** A skill deletion the chat model requested; the API waits for the user's decision. */
export interface SkillDeletionRequest {
  requestId: string;
  skillId: string;
  name: string;
  description?: string;
  conversationId?: string;
  requestedAt: number;
}

const DELETION_REQUESTS_KEY = 'skillDeletionRequests';
const base = () => `${apiBaseUrl()}/api/skills/deletion-requests`;

/**
 * Requests only exist while a response is generating (the tool blocks on them),
 * so poll quickly during generation and not at all otherwise.
 */
export const useSkillDeletionRequestsQuery = () => {
  const generating = useRecoilValue(store.anySubmittingSelector);
  return useQuery<{ requests: SkillDeletionRequest[] }>(
    [DELETION_REQUESTS_KEY],
    () => request.get(base()),
    {
      enabled: generating,
      refetchInterval: generating ? 2000 : false,
      refetchOnWindowFocus: generating,
      staleTime: 0,
    },
  );
};

export const useDecideSkillDeletionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ requestId, approve }: { requestId: string; approve: boolean }) =>
      request.post(`${base()}/${encodeURIComponent(requestId)}/decision`, { approve }),
    {
      onSettled: (_data, _error, { approve }) => {
        queryClient.invalidateQueries([DELETION_REQUESTS_KEY]);
        if (approve) {
          // The tool deletes right after approval; refresh lists once it has.
          setTimeout(() => queryClient.invalidateQueries([QueryKeys.skills]), 1500);
        }
      },
    },
  );
};
