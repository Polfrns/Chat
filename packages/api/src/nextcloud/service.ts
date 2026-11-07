import { randomUUID } from 'crypto';
import type { NextcloudProposal } from 'librechat-data-provider';
import type {
  NextcloudCredentials,
  NextcloudIdentity,
  NextcloudListing,
  NextcloudLoginFlow,
  NextcloudWriteInput,
} from './types';
import {
  NextcloudError,
  NextcloudWebDAV,
  assertWritablePath,
  isReadOnlyPath,
  MAX_FILE_BYTES,
  MAX_TEXT_BYTES,
} from './webdav';

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const LOGIN_TTL_MS = 20 * 60 * 1000;

type ProposalStatus = NextcloudProposal['status'];

export interface ConnectionRecord {
  server: string;
  username?: string;
  uid?: string;
  revision?: string;
  credentials?: string;
  flow?: string;
}

export interface ProposalRecord {
  id: string;
  conversationId: string;
  revision: string;
  path: string;
  mode: 'create' | 'replace';
  bytes: number;
  payload: string;
  status: ProposalStatus;
  error?: string;
  expiresAt: Date;
}

/** The query the repository returns: awaited as is, or `.lean()` for a plain object. */
interface Query<T> extends PromiseLike<T> {
  lean(): Promise<T>;
}
interface SortableQuery<T> {
  sort(order: Record<string, 1 | -1>): SortableQuery<T>;
  limit(count: number): SortableQuery<T>;
  lean(): Promise<T>;
}
type Filter = object;

/**
 * Persistence the service needs. `api/server/services/Nextcloud/store.js` implements it with Mongoose;
 * tests pass scripted objects, so the service never imports a database driver.
 */
export interface NextcloudRepository {
  Connection: {
    findOne(filter: Filter): Query<ConnectionRecord | null>;
    findOneAndUpdate(
      filter: Filter,
      update: Filter,
      options?: Filter,
    ): Query<ConnectionRecord | null>;
    findOneAndDelete(filter: Filter): Query<ConnectionRecord | null>;
    updateOne(filter: Filter, update: Filter): Promise<unknown>;
  };
  AccountIdentity: {
    findOneAndUpdate(
      filter: Filter,
      update: Filter,
      options?: Filter,
    ): Query<{ owner: string } | null>;
  };
  Proposal: {
    create(value: Filter): Promise<ProposalRecord>;
    find(filter: Filter): SortableQuery<ProposalRecord[]>;
    findOne(filter: Filter): Query<ProposalRecord | null>;
    findOneAndUpdate(
      filter: Filter,
      update: Filter,
      options?: Filter,
    ): Query<ProposalRecord | null>;
    updateOne(filter: Filter, update: Filter): Promise<unknown>;
    deleteMany(filter: Filter): Promise<unknown>;
  };
  seal(value: unknown): Promise<string>;
  unseal<T = unknown>(value: string): Promise<T>;
}

interface ProposalPayload {
  base64: string;
  contentType: string;
  expectedEtag?: string | null;
  before?: string;
  after?: string;
  sourceName?: string;
}

type LinkedAccount = Omit<ConnectionRecord, 'credentials'> & { credentials: NextcloudCredentials };

export type PublicProposal = Omit<NextcloudProposal, 'expiresAt'> & { expiresAt: Date };

/** Service dependencies also accept scripted DAV and isolated repositories. */
export class NextcloudService {
  constructor(
    private readonly dav: NextcloudWebDAV,
    private readonly repository: NextcloudRepository,
  ) {}

  async status(
    identity: NextcloudIdentity,
  ): Promise<{ enabled: boolean; connected: boolean; username?: string }> {
    const account = await this.repository.Connection.findOne(identity).lean();
    return {
      enabled: true,
      connected: !!account?.credentials && account.server === this.dav.baseUrl,
      username: account?.username,
    };
  }

  async startLogin(identity: NextcloudIdentity): Promise<{ login: string }> {
    const flow = await this.dav.startLogin();
    await this.repository.Connection.findOneAndUpdate(
      identity,
      {
        $set: {
          ...identity,
          flowServer: this.dav.baseUrl,
          flow: await this.repository.seal(flow),
          flowExpires: new Date(Date.now() + LOGIN_TTL_MS),
          pollingUntil: new Date(0),
        },
        $setOnInsert: { server: this.dav.baseUrl },
      },
      { upsert: true },
    );
    return { login: flow.login };
  }

  async finishLogin(
    identity: NextcloudIdentity,
  ): Promise<{ connected: boolean; username?: string }> {
    const account = await this.repository.Connection.findOneAndUpdate(
      {
        ...identity,
        flowServer: this.dav.baseUrl,
        flow: { $ne: null },
        flowExpires: { $gt: new Date() },
        pollingUntil: { $lt: new Date() },
      },
      { $set: { pollingUntil: new Date(Date.now() + 60000) } },
      { new: true },
    ).lean();
    if (!account?.flow) {
      return { connected: false };
    }
    try {
      const credentials = await this.dav.pollLogin(
        await this.repository.unseal<NextcloudLoginFlow>(account.flow),
      );
      if (!credentials) {
        return { connected: false };
      }
      await this.connect(identity, credentials, account.flow);
      return { connected: true, username: credentials.loginName };
    } finally {
      await this.repository.Connection.updateOne(
        { ...identity, flow: account.flow },
        { $set: { pollingUntil: new Date(0) } },
      );
    }
  }

  async connect(
    identity: NextcloudIdentity,
    credentials: NextcloudCredentials,
    expectedFlow?: string,
  ): Promise<void> {
    const linked = await this.repository.AccountIdentity.findOneAndUpdate(
      { server: this.dav.baseUrl, uid: credentials.uid, tenantId: identity.tenantId },
      { $setOnInsert: { owner: identity.owner } },
      { upsert: true, new: true },
    ).lean();
    if (linked?.owner !== identity.owner) {
      throw new NextcloudError(
        'This Nextcloud account is already linked to another Roko account',
        409,
      );
    }
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
    if (!connection) {
      throw new NextcloudError('The connection attempt was cancelled; start again', 409);
    }
    await this.repository.Proposal.deleteMany({ ...identity, status: 'pending' });
  }

  async account(identity: NextcloudIdentity): Promise<LinkedAccount> {
    const account = await this.repository.Connection.findOne(identity).lean();
    if (!account?.credentials || account.server !== this.dav.baseUrl) {
      throw new NextcloudError(
        'Connect your Nextcloud account from the attachment menu first',
        409,
      );
    }
    return {
      ...account,
      credentials: await this.repository.unseal<NextcloudCredentials>(account.credentials),
    };
  }

  async disconnect(
    identity: NextcloudIdentity,
  ): Promise<{ disconnected: boolean; revocationFailed: boolean }> {
    const account = await this.repository.Connection.findOneAndDelete(identity).lean();
    await this.repository.Proposal.deleteMany(identity);
    if (account?.credentials && account.server === this.dav.baseUrl) {
      try {
        await this.dav.revoke(
          await this.repository.unseal<NextcloudCredentials>(account.credentials),
        );
      } catch {
        return { disconnected: true, revocationFailed: true };
      }
    }
    return { disconnected: true, revocationFailed: false };
  }

  async list(identity: NextcloudIdentity, path: string): Promise<NextcloudListing> {
    const account = await this.account(identity);
    return this.dav.list(account.credentials, path);
  }

  async read(
    identity: NextcloudIdentity,
    path: string,
    limit?: number,
  ): Promise<{ buffer: Buffer; etag: string; contentType: string }> {
    const account = await this.account(identity);
    return this.dav.read(account.credentials, path, limit);
  }

  async propose(
    identity: NextcloudIdentity,
    {
      conversationId,
      path,
      mode,
      buffer,
      contentType,
      expectedEtag,
      text = false,
      sourceName,
    }: NextcloudWriteInput,
  ): Promise<PublicProposal> {
    if (typeof conversationId !== 'string' || !conversationId || conversationId.length > 100) {
      throw new NextcloudError('A conversation is required');
    }
    path = assertWritablePath(path);
    if (!['create', 'replace'].includes(mode)) {
      throw new NextcloudError('Invalid write mode');
    }
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) {
      throw new NextcloudError('File exceeds 8 MiB', 413);
    }
    if (text && buffer.length > MAX_TEXT_BYTES) {
      throw new NextcloudError('Text exceeds 512 KiB', 413);
    }
    const account = await this.account(identity);
    let before: string | undefined;
    if (mode === 'replace') {
      if (typeof expectedEtag !== 'string' || !/^"[^\r\n"]*"$/.test(expectedEtag)) {
        throw new NextcloudError('Read the original and supply its strong ETag before editing');
      }
      const original = await this.dav.read(
        account.credentials,
        path,
        text ? MAX_TEXT_BYTES : MAX_FILE_BYTES,
      );
      if (original.etag !== expectedEtag) {
        throw new NextcloudError(
          'The original changed; read it again before proposing an edit',
          412,
        );
      }
      if (text) {
        before = original.buffer.toString('utf8');
      }
    }
    const proposal = await this.repository.Proposal.create({
      ...identity,
      id: randomUUID(),
      conversationId,
      revision: account.revision,
      path,
      mode,
      bytes: buffer.length,
      status: 'pending',
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
      payload: await this.repository.seal({
        base64: buffer.toString('base64'),
        contentType,
        expectedEtag: mode === 'replace' ? expectedEtag : null,
        before,
        after: text ? buffer.toString('utf8') : undefined,
        sourceName,
      } satisfies ProposalPayload),
    });
    return this.publicProposal(proposal);
  }

  async publicProposal(proposal: ProposalRecord): Promise<PublicProposal> {
    const payload = await this.repository.unseal<ProposalPayload>(proposal.payload);
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

  async pending(identity: NextcloudIdentity, conversationId?: string): Promise<PublicProposal[]> {
    const query: Record<string, unknown> = {
      ...identity,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    };
    if (conversationId) {
      query.conversationId = conversationId;
    }
    const proposals = await this.repository.Proposal.find(query)
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();
    return Promise.all(proposals.map((proposal) => this.publicProposal(proposal)));
  }

  async proposalStatus(
    identity: NextcloudIdentity,
    id: string,
  ): Promise<{ id: string; status: ProposalStatus; path: string; error?: string }> {
    const proposal = await this.repository.Proposal.findOne({
      ...identity,
      id,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!proposal) {
      throw new NextcloudError('Proposal not found or expired', 404);
    }
    return { id, status: proposal.status, path: proposal.path, error: proposal.error };
  }

  async decide(
    identity: NextcloudIdentity,
    id: string,
    approve: boolean,
  ): Promise<{ id: string; status: ProposalStatus; path?: string }> {
    const proposal = await this.repository.Proposal.findOneAndUpdate(
      { ...identity, id, status: 'pending', expiresAt: { $gt: new Date() } },
      {
        $set: {
          status: approve ? 'writing' : 'rejected',
          expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
        },
      },
      { new: true },
    ).lean();
    if (!proposal) {
      throw new NextcloudError('Proposal not found, expired or already decided', 409);
    }
    if (!approve) {
      return { id, status: 'rejected' };
    }
    try {
      assertWritablePath(proposal.path);
      const account = await this.account(identity);
      if (account.revision !== proposal.revision) {
        throw new NextcloudError('The linked account changed; propose the operation again', 409);
      }
      const payload = await this.repository.unseal<ProposalPayload>(proposal.payload);
      await this.dav.write(
        account.credentials,
        proposal.path,
        Buffer.from(payload.base64, 'base64'),
        payload.contentType,
        payload.expectedEtag,
      );
      await this.repository.Proposal.updateOne(
        { ...identity, id, status: 'writing' },
        { $set: { status: 'saved' } },
      );
      return { id, status: 'saved', path: proposal.path };
    } catch (error) {
      const message =
        error instanceof NextcloudError
          ? error.message
          : 'The write could not be completed; check the file before retrying';
      await this.repository.Proposal.updateOne(
        { ...identity, id, status: 'writing' },
        { $set: { status: 'failed', error: message } },
      );
      throw new NextcloudError(message, error instanceof NextcloudError ? error.status : 502);
    }
  }
}
