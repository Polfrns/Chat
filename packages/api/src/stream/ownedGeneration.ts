import type { AbortResult } from './interfaces/IJobStore';
import type { GenerationJob } from '~/types/stream';

/** The slice of the generation job manager needed to stop one caller-owned run. */
export interface OwnedGenerationControl {
  getJob: (streamId: string) => Promise<Pick<GenerationJob, 'metadata'> | undefined>;
  abortJob: (streamId: string) => Promise<AbortResult>;
}

const NOT_FOUND: AbortResult = {
  success: false,
  jobData: null,
  content: [],
  finalEvent: null,
  text: '',
  collectedUsage: [],
};

/**
 * Stops `streamId` only when `user` owns it. A run owned by another user or tenant
 * reads as not found, so a caller cannot tell it apart from one that does not exist.
 * Ported from upstream LibreChat 379a6ff24 without its epoch fence, which this fork's
 * `abortJob` does not support; stream ids are conversation ids, so a replacement run
 * started between the read and the stop belongs to the same owner.
 */
export async function abortOwnedGeneration(
  streamId: string,
  user: { id: string; tenantId?: string },
  control: OwnedGenerationControl,
): Promise<AbortResult> {
  const job = await control.getJob(streamId);
  const tenantId = job?.metadata?.tenantId;
  if (
    !job ||
    job.metadata?.userId !== user.id ||
    (tenantId != null && tenantId !== user.tenantId)
  ) {
    return { ...NOT_FOUND, content: [], collectedUsage: [] };
  }
  return control.abortJob(streamId);
}
