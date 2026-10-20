import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TFilestoreListResponse, TFilestoreFilesResponse } from 'librechat-data-provider';

export const useFilestoresQuery = (
  search?: string,
  config?: UseQueryOptions<TFilestoreListResponse>,
): QueryObserverResult<TFilestoreListResponse, unknown> => {
  return useQuery<TFilestoreListResponse>(
    [QueryKeys.filestores, { search }],
    () => dataService.listFilestores(search),
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useFilestoreFilesQuery = (
  filestoreUid?: string | null,
  config?: UseQueryOptions<TFilestoreFilesResponse>,
): QueryObserverResult<TFilestoreFilesResponse, unknown> => {
  return useQuery<TFilestoreFilesResponse>(
    [QueryKeys.filestoreFiles, filestoreUid],
    () => dataService.listFilestoreFiles(filestoreUid ?? ''),
    { enabled: Boolean(filestoreUid), refetchOnWindowFocus: false, ...config },
  );
};
