jest.mock('./store', () => ({}));
const { NextcloudService } = require('./service');
const { NextcloudError } = require('./webdav');

class ScriptedDAV {
  constructor() {
    this.baseUrl = 'https://cloud.test';
    this.read = jest.fn().mockResolvedValue({ buffer: Buffer.from('original'), etag: '"v1"' });
    this.write = jest.fn().mockResolvedValue(undefined);
  }
}

const owner = { owner: 'alice-roko', tenantId: 'tenant-a' };
const credentials = { loginName: 'alice', appPassword: 'secret', uid: 'alice' };
const sealedPayload = JSON.stringify({ base64: Buffer.from('edited').toString('base64'), contentType: 'text/plain', expectedEtag: '"v1"' });
const pending = { ...owner, id: 'proposal', revision: 'r1', path: 'original.txt', mode: 'replace', payload: sealedPayload, status: 'writing' };

function fixture() {
  const dav = new ScriptedDAV();
  const repository = {
    Connection: {
      findOne: jest.fn(() => ({ lean: async () => ({ server: dav.baseUrl, revision: 'r1', credentials: JSON.stringify(credentials) }) })),
      findOneAndUpdate: jest.fn(),
    },
    AccountIdentity: { findOneAndUpdate: jest.fn() },
    Proposal: {
      create: jest.fn(async (value) => value),
      findOneAndUpdate: jest.fn(() => ({ lean: async () => pending })),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findOne: jest.fn(() => ({ lean: async () => null })),
    },
    seal: async (value) => JSON.stringify(value),
    unseal: async (value) => JSON.parse(value),
  };
  return { dav, repository, service: new NextcloudService(dav, repository) };
}

describe('Nextcloud write approval', () => {
  it('does not link a Nextcloud identity already owned by another Roko account', async () => {
    const { service, repository } = fixture();
    repository.AccountIdentity.findOneAndUpdate.mockReturnValue({ lean: async () => ({ owner: 'bob' }) });
    await expect(service.connect(owner, credentials)).rejects.toMatchObject({ status: 409 });
    expect(repository.Connection.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('only stages an immutable proposal and never writes before a decision', async () => {
    const { service, repository, dav } = fixture();
    const result = await service.propose(owner, { conversationId: 'chat', path: 'copy.txt', mode: 'create', buffer: Buffer.from('new'), contentType: 'text/plain', text: true });
    expect(result).toMatchObject({ status: 'pending', after: 'new', mode: 'create' });
    expect(dav.write).not.toHaveBeenCalled();
    expect(repository.Proposal.create.mock.calls[0][0]).toMatchObject(owner);
    expect(repository.Connection.findOne).toHaveBeenCalledWith(owner);
  });

  it('rejects an edit based on an outdated original', async () => {
    const { service, repository, dav } = fixture();
    await expect(service.propose(owner, { conversationId: 'chat', path: 'original.txt', mode: 'replace', buffer: Buffer.from('edit'), expectedEtag: '"old"', contentType: 'text/plain' })).rejects.toMatchObject({ status: 412 });
    expect(repository.Proposal.create).not.toHaveBeenCalled();
    expect(dav.write).not.toHaveBeenCalled();
  });

  it('claims a live pending approval scoped to the exact owner and tenant', async () => {
    const { service, repository, dav } = fixture();
    await service.decide(owner, 'proposal', true);
    expect(repository.Proposal.findOneAndUpdate).toHaveBeenCalledWith(
      { ...owner, id: 'proposal', status: 'pending', expiresAt: { $gt: expect.any(Date) } },
      { $set: { status: 'writing', expiresAt: expect.any(Date) } }, { new: true },
    );
    expect(dav.write).toHaveBeenCalledWith(credentials, 'original.txt', Buffer.from('edited'), 'text/plain', '"v1"');
  });

  it('does not write when the approval belongs to another owner, expired or was consumed', async () => {
    const { service, repository, dav } = fixture();
    repository.Proposal.findOneAndUpdate.mockReturnValue({ lean: async () => null });
    await expect(service.decide({ owner: 'bob', tenantId: 'tenant-b' }, 'proposal', true)).rejects.toMatchObject({ status: 409 });
    expect(repository.Proposal.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ owner: 'bob', tenantId: 'tenant-b' });
    expect(dav.write).not.toHaveBeenCalled();
  });

  it('does not reuse approval after reconnecting a different account', async () => {
    const { service, repository, dav } = fixture();
    repository.Connection.findOne.mockReturnValue({ lean: async () => ({ server: dav.baseUrl, revision: 'r2', credentials: JSON.stringify(credentials) }) });
    await expect(service.decide(owner, 'proposal', true)).rejects.toMatchObject({ status: 409 });
    expect(dav.write).not.toHaveBeenCalled();
  });

  it('records a conflict at execution time instead of silently overwriting', async () => {
    const { service, repository, dav } = fixture();
    dav.write.mockRejectedValue(new NextcloudError('Nextcloud returned HTTP 412', 412));
    await expect(service.decide(owner, 'proposal', true)).rejects.toMatchObject({ status: 412 });
    expect(repository.Proposal.updateOne).toHaveBeenLastCalledWith({ ...owner, id: 'proposal', status: 'writing' }, { $set: { status: 'failed', error: 'Nextcloud returned HTTP 412' } });
  });

  it('rejecting a proposal causes no write', async () => {
    const { service, dav } = fixture();
    expect(await service.decide(owner, 'proposal', false)).toEqual({ id: 'proposal', status: 'rejected' });
    expect(dav.write).not.toHaveBeenCalled();
  });
});
