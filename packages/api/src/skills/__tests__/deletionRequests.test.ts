jest.mock('../../cache/redisClients', () => ({ ioredisClient: null }));

import { skillDeletionRequests } from '../deletionRequests';

const proposal = { skillId: 'skill-1', name: 'weekly-report', description: 'Formats reports' };

describe('skillDeletionRequests', () => {
  it('only lists and resolves requests for the user who owns them', async () => {
    const requestId = await skillDeletionRequests.add('owner', proposal);

    expect(await skillDeletionRequests.list('owner')).toEqual([
      expect.objectContaining({ ...proposal, requestId }),
    ]);
    expect(await skillDeletionRequests.list('intruder')).toEqual([]);
    expect(await skillDeletionRequests.decide('intruder', requestId, 'approve')).toBe(false);

    const waiting = skillDeletionRequests.waitForDecision('owner', requestId, 1000);
    expect(await skillDeletionRequests.decide('owner', requestId, 'approve')).toBe(true);
    await expect(waiting).resolves.toBe('approve');

    expect(await skillDeletionRequests.list('owner')).toEqual([]);
    await skillDeletionRequests.remove('owner', requestId);
  });

  it('cannot change a decision once made', async () => {
    const requestId = await skillDeletionRequests.add('owner', proposal);
    expect(await skillDeletionRequests.decide('owner', requestId, 'deny')).toBe(true);
    expect(await skillDeletionRequests.decide('owner', requestId, 'approve')).toBe(false);
    await expect(skillDeletionRequests.waitForDecision('owner', requestId, 50)).resolves.toBe(
      'deny',
    );
    await skillDeletionRequests.remove('owner', requestId);
  });

  it('reports no decision when the user does not answer in time', async () => {
    const requestId = await skillDeletionRequests.add('owner', proposal);
    await expect(skillDeletionRequests.waitForDecision('owner', requestId, 30)).resolves.toBeNull();
    await skillDeletionRequests.remove('owner', requestId);
    expect(await skillDeletionRequests.decide('owner', requestId, 'approve')).toBe(false);
  });
});
