import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TFilestore,
  TCreateFilestoreRequest,
  TUpdateFilestoreRequest,
  TDeleteCountResponse,
  TFilestoreFileUploadResponse,
  TFilestoreFileMoveRequest,
  TFilestoreFileMoveResponse,
} from 'librechat-data-provider';

export const useCreateFilestoreMutation = (): UseMutationResult<
  TFilestore,
  unknown,
  TCreateFilestoreRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TCreateFilestoreRequest) => dataService.createFilestore(payload), {
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.filestores]),
  });
};

export const useUpdateFilestoreMutation = (): UseMutationResult<
  TFilestore,
  unknown,
  { id: string; data: TUpdateFilestoreRequest },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(({ id, data }) => dataService.updateFilestore(id, data), {
    onSuccess: (store) => {
      queryClient.setQueryData([QueryKeys.filestore, store.uid], store);
      queryClient.invalidateQueries([QueryKeys.filestores]);
    },
  });
};

export const useDeleteFilestoreMutation = (): UseMutationResult<
  TDeleteCountResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((id: string) => dataService.deleteFilestore(id), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.filestores]);
      /** Deleting a store also pulls it from every session's filestoreUids. */
      queryClient.invalidateQueries([QueryKeys.sessions]);
      queryClient.invalidateQueries([QueryKeys.session]);
      queryClient.invalidateQueries([QueryKeys.sessionFilestores]);
    },
  });
};

export const useUploadFilestoreFileMutation = (
  filestoreUid: string,
): UseMutationResult<
  TFilestoreFileUploadResponse,
  unknown,
  { path: string; file: File },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ path, file }: { path: string; file: File }) => {
      const form = new FormData();
      form.append('path', path);
      form.append('file', file, file.name);
      return dataService.uploadFilestoreFile(filestoreUid, form);
    },
    {
      onSuccess: () => queryClient.invalidateQueries([QueryKeys.filestoreFiles, filestoreUid]),
    },
  );
};

export const useMoveFilestoreFileMutation = (
  filestoreUid: string,
): UseMutationResult<TFilestoreFileMoveResponse, unknown, TFilestoreFileMoveRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: TFilestoreFileMoveRequest) => dataService.moveFilestoreFile(filestoreUid, payload),
    {
      onSuccess: () => queryClient.invalidateQueries([QueryKeys.filestoreFiles, filestoreUid]),
    },
  );
};
