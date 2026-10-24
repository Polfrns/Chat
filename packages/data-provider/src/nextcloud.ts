export const NEXTCLOUD_TOOL_NAME = 'nextcloud_files';
export const NEXTCLOUD_ATTACHMENT_SOURCE = Symbol('nextcloud-attachment-source');

export type NextcloudAttachmentFile = File & { [NEXTCLOUD_ATTACHMENT_SOURCE]?: true };

export function markNextcloudAttachment(file: File): NextcloudAttachmentFile {
  Object.defineProperty(file, NEXTCLOUD_ATTACHMENT_SOURCE, { value: true });
  return file as NextcloudAttachmentFile;
}

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
  readOnly?: boolean;
  status: 'pending' | 'writing' | 'saved' | 'rejected' | 'failed';
  error?: string;
  expiresAt: string;
}
