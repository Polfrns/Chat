export const NEXTCLOUD_TOOL_NAME = 'nextcloud_files';

export interface NextcloudEntry {
  path: string;
  name: string;
  directory: boolean;
  bytes: number;
  etag: string;
}

export interface NextcloudStatus {
  enabled: boolean;
  connected: boolean;
  username?: string;
}

export interface NextcloudProposal {
  id: string;
  conversationId: string;
  path: string;
  mode: 'create' | 'replace';
  bytes: number;
  before?: string;
  after?: string;
  sourceName?: string;
  status: 'pending' | 'writing' | 'saved' | 'rejected' | 'failed';
  error?: string;
  expiresAt: string;
}
