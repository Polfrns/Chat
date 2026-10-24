const { randomUUID } = require('crypto');
const {
  NextcloudWebDAV,
  NextcloudError,
  filePath,
  assertWritablePath,
  isReadOnlyPath,
  MAX_FILE_BYTES,
  MAX_TEXT_BYTES,
} = require('./webdav');
const store = require('./store');

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const LOGIN_TTL_MS = 20 * 60 * 1000;

/**
 * @typedef {{owner: string, tenantId: string}} NextcloudIdentity
 * @typedef {Object} NextcloudWriteInput
 * @property {string} conversationId
 * @property {string} path
 * @property {'create'|'replace'} mode
 * @property {Buffer} buffer
 * @property {string} contentType
 * @property {string} [expectedEtag]
 * @property {boolean} [text]
 * @property {string} [sourceName]
 */

/** Service dependencies also accept scripted DAV and isolated repositories. */
class NextcloudService {
  constructor(dav, repository = store) {
    this.dav = dav;
    this.repository = repository;
  }

  async status(identity) {
    const account = await this.repository.Connection.findOne(identity).lean();
    return { enabled: true, connected: !!account?.credentials && account.server === this.dav.baseUrl, username: account?.username };
  }

  async startLogin(identity) {
    const flow = await this.dav.startLogin();
    await this.repository.Connection.findOneAndUpdate(identity, { $set: {
      ...identity, flowServer: this.dav.baseUrl, flow: await this.repository.seal(flow),
      flowExpires: new Date(Date.now() + LOGIN_TTL_MS), pollingUntil: new Date(0),
    }, $setOnInsert: { server: this.dav.baseUrl } }, { upsert: true });
    return { login: flow.login };
  }

  async finishLogin(identity) {
    const account = await this.repository.Connection.findOneAndUpdate({
      ...identity, flowServer: this.dav.baseUrl, flow: { $ne: null },
      flowExpires: { $gt: new Date() }, pollingUntil: { $lt: new Date() },
    }, { $set: { pollingUntil: new Date(Date.now() + 60000) } }, { new: true }).lean();
    if (!account) return { connected: false };
    try {
      const credentials = await this.dav.pollLogin(await this.repository.unseal(account.flow));
      if (!credentials) return { connected: false };
      await this.connect(identity, credentials, account.flow);
      return { connected: true, username: credentials.loginName };
    } finally {
      await this.repository.Connection.updateOne({ ...identity, flow: account.flow }, { $set: { pollingUntil: new Date(0) } });
    }
  }

  async connect(identity, credentials, expectedFlow) {
    const linked = await this.repository.AccountIdentity.findOneAndUpdate({
      server: this.dav.baseUrl, uid: credentials.uid, tenantId: identity.tenantId,
    }, { $setOnInsert: { owner: identity.owner } }, { upsert: true, new: true }).lean();
    if (linked.owner !== identity.owner) throw new NextcloudError('This Nextcloud account is already linked to another Roko account', 409);
    const connection = await this.repository.Connection.findOneAndUpdate(
      expectedFlow ? { ...identity, flow: expectedFlow } : identity,
      {
        $set: {
          ...identity,
          server: this.dav.baseUrl,
          username: credentials.loginName,
          uid: credentials.uid,
          credentials: await this.repository.seal(credentials),
          revision: randomUUID(),
        },
        $unset: { flow: 1, flowServer: 1, flowExpires: 1, pollingUntil: 1 },
      },
      { upsert: !expectedFlow, new: true },
    );
    if (!connection) throw new NextcloudError('The connection attempt was cancelled; start again', 409);
    await this.repository.Proposal.deleteMany({ ...identity, status: 'pending' });
  }

  async account(identity) {
    const account = await this.repository.Connection.findOne(identity).lean();
    if (!account?.credentials || account.server !== this.dav.baseUrl) {
      throw new NextcloudError('Connect your Nextcloud account from the attachment menu first', 409);
    }
    return { ...account, credentials: await this.repository.unseal(account.credentials) };
  }

  async disconnect(identity) {
    const account = await this.repository.Connection.findOneAndDelete(identity).lean();
    await this.repository.Proposal.deleteMany(identity);
    if (account?.credentials && account.server === this.dav.baseUrl) {
      try { await this.dav.revoke(await this.repository.unseal(account.credentials)); }
      catch { return { disconnected: true, revocationFailed: true }; }
    }
    return { disconnected: true, revocationFailed: false };
  }

  async list(identity, path) {
    const account = await this.account(identity);
    return this.dav.list(account.credentials, path);
  }

  async read(identity, path, limit) {
    const account = await this.account(identity);
    return this.dav.read(account.credentials, path, limit);
  }

  /** @param {NextcloudIdentity} identity @param {NextcloudWriteInput} input */
  async propose(identity, { conversationId, path, mode, buffer, contentType, expectedEtag, text = false, sourceName }) {
    if (typeof conversationId !== 'string' || !conversationId || conversationId.length > 100) throw new NextcloudError('A conversation is required');
    path = assertWritablePath(path);
    if (!['create', 'replace'].includes(mode)) throw new NextcloudError('Invalid write mode');
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) throw new NextcloudError('File exceeds 8 MiB', 413);
    if (text && buffer.length > MAX_TEXT_BYTES) throw new NextcloudError('Text exceeds 512 KiB', 413);
    const account = await this.account(identity);
    let before;
    if (mode === 'replace') {
      if (typeof expectedEtag !== 'string' || !/^"[^\r\n"]*"$/.test(expectedEtag)) throw new NextcloudError('Read the original and supply its strong ETag before editing');
      const original = await this.dav.read(account.credentials, path, text ? MAX_TEXT_BYTES : MAX_FILE_BYTES);
      if (original.etag !== expectedEtag) throw new NextcloudError('The original changed; read it again before proposing an edit', 412);
      if (text) before = original.buffer.toString('utf8');
    }
    const proposal = await this.repository.Proposal.create({
      ...identity, id: randomUUID(), conversationId, revision: account.revision, path, mode,
      bytes: buffer.length, status: 'pending', expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
      payload: await this.repository.seal({ base64: buffer.toString('base64'), contentType, expectedEtag: mode === 'replace' ? expectedEtag : null, before, after: text ? buffer.toString('utf8') : undefined, sourceName }),
    });
    return this.publicProposal(proposal);
  }

  async publicProposal(proposal) {
    const payload = await this.repository.unseal(proposal.payload);
    return {
      id: proposal.id,
      conversationId: proposal.conversationId,
      path: proposal.path,
      mode: proposal.mode,
      bytes: proposal.bytes,
      status: proposal.status,
      error: proposal.error,
      expiresAt: proposal.expiresAt,
      before: payload.before,
      after: payload.after,
      sourceName: payload.sourceName,
      readOnly: isReadOnlyPath(proposal.path),
    };
  }

  async pending(identity, conversationId) {
    const query = { ...identity, status: 'pending', expiresAt: { $gt: new Date() } };
    if (conversationId) query.conversationId = conversationId;
    const proposals = await this.repository.Proposal.find(query).sort({ createdAt: 1 }).limit(10).lean();
    return Promise.all(proposals.map((proposal) => this.publicProposal(proposal)));
  }

  async proposalStatus(identity, id) {
    const proposal = await this.repository.Proposal.findOne({ ...identity, id, expiresAt: { $gt: new Date() } }).lean();
    if (!proposal) throw new NextcloudError('Proposal not found or expired', 404);
    return { id, status: proposal.status, path: proposal.path, error: proposal.error };
  }

  async decide(identity, id, approve) {
    const proposal = await this.repository.Proposal.findOneAndUpdate({
      ...identity, id, status: 'pending', expiresAt: { $gt: new Date() },
    }, { $set: {
      status: approve ? 'writing' : 'rejected',
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    } }, { new: true }).lean();
    if (!proposal) throw new NextcloudError('Proposal not found, expired or already decided', 409);
    if (!approve) return { id, status: 'rejected' };
    try {
      assertWritablePath(proposal.path);
      const account = await this.account(identity);
      if (account.revision !== proposal.revision) throw new NextcloudError('The linked account changed; propose the operation again', 409);
      const payload = await this.repository.unseal(proposal.payload);
      await this.dav.write(account.credentials, proposal.path, Buffer.from(payload.base64, 'base64'), payload.contentType, payload.expectedEtag);
      await this.repository.Proposal.updateOne({ ...identity, id, status: 'writing' }, { $set: { status: 'saved' } });
      return { id, status: 'saved', path: proposal.path };
    } catch (error) {
      const message = error instanceof NextcloudError ? error.message : 'The write could not be completed; check the file before retrying';
      await this.repository.Proposal.updateOne({ ...identity, id, status: 'writing' }, { $set: { status: 'failed', error: message } });
      throw new NextcloudError(message, error instanceof NextcloudError ? error.status : 502);
    }
  }
}

function getNextcloudService() {
  return new NextcloudService(new NextcloudWebDAV(process.env.NEXTCLOUD_URL));
}

module.exports = { NextcloudService, getNextcloudService };
