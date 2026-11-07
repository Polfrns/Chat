import type { NextcloudEntry } from 'librechat-data-provider';

export interface NextcloudCredentials {
  loginName: string;
  appPassword: string;
  uid: string;
}

export interface NextcloudLoginFlow {
  token: string;
  endpoint: string;
}

/** Entries of a folder plus how many were left out because their names could not be used safely. */
export interface NextcloudListing {
  entries: NextcloudEntry[];
  skipped: number;
}

/** Who owns a connection or proposal: the Roko user within a tenant. */
export interface NextcloudIdentity {
  owner: string;
  tenantId: string;
}

export interface NextcloudWriteInput {
  conversationId: string;
  path: string;
  mode: 'create' | 'replace';
  buffer: Buffer;
  contentType: string;
  expectedEtag?: string;
  text?: boolean;
  sourceName?: string;
}
