import type { AbortResult } from '../interfaces/IJobStore';
import type { OwnedGenerationControl } from '../ownedGeneration';
import { abortOwnedGeneration } from '../ownedGeneration';

class FakeJobManager {
  readonly aborted: string[] = [];
  private readonly jobs = new Map<string, { metadata: { userId: string; tenantId?: string } }>([
    ['s1', { metadata: { userId: 'u1' } }],
    ['s2', { metadata: { userId: 'u2' } }],
    ['s3', { metadata: { userId: 'u1', tenantId: 't1' } }],
  ]);

  async getJob(streamId: string) {
    return this.jobs.get(streamId);
  }

  async abortJob(streamId: string): Promise<AbortResult> {
    this.aborted.push(streamId);
    return { success: true, jobData: null, content: [], finalEvent: null, text: 'partial', collectedUsage: [] };
  }
}

const control = (manager: FakeJobManager) => manager as unknown as OwnedGenerationControl;

describe('abortOwnedGeneration', () => {
  it("stops the caller's own run", async () => {
    const manager = new FakeJobManager();
    await expect(abortOwnedGeneration('s1', { id: 'u1' }, control(manager))).resolves.toMatchObject({
      success: true,
    });
    expect(manager.aborted).toEqual(['s1']);
  });

  it.each([
    ['another user', 's2', { id: 'u1' }],
    ['another tenant', 's3', { id: 'u1', tenantId: 't2' }],
    ['a missing run', 'missing', { id: 'u1' }],
  ])('reports %s as not found without stopping anything or leaking output', async (_case, streamId, user) => {
    const manager = new FakeJobManager();
    const result = await abortOwnedGeneration(streamId, user, control(manager));
    expect(result).toMatchObject({ success: false, jobData: null, text: '', content: [] });
    expect(manager.aborted).toEqual([]);
  });
});
