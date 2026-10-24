import axios from 'axios';
import { apiBaseUrl, request } from 'librechat-data-provider';
import { markNextcloudAttachment } from 'librechat-data-provider';
import type { NextcloudEntry, NextcloudProposal, NextcloudStatus } from 'librechat-data-provider';

const base = () => `${apiBaseUrl()}/api/nextcloud`;
export const nextcloud = {
  status: (): Promise<NextcloudStatus> => request.get(`${base()}/status`),
  connect: (): Promise<{ login: string }> => request.post(`${base()}/connect`),
  poll: (): Promise<{ connected: boolean }> => request.post(`${base()}/connect/poll`),
  disconnect: (): Promise<{ revocationFailed: boolean }> => request.delete(`${base()}/connection`),
  list: (path: string): Promise<{ files: NextcloudEntry[] }> => request.get(`${base()}/files?path=${encodeURIComponent(path)}`),
  pending: (conversationId: string): Promise<{ proposals: NextcloudProposal[] }> => request.get(`${base()}/proposals?conversationId=${encodeURIComponent(conversationId)}`),
  decide: (id: string, approve: boolean): Promise<{ status: string }> => request.post(`${base()}/proposals/${encodeURIComponent(id)}/decision`, { approve }),
  download: async (entry: NextcloudEntry): Promise<File> => {
    const result = await axios.get<Blob>(`${base()}/download?path=${encodeURIComponent(entry.path)}`, { responseType: 'blob' });
    const contentType = (result.headers['x-nextcloud-content-type'] || 'application/octet-stream')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    return markNextcloudAttachment(new File([result.data], entry.name, {
      type: contentType,
    }));
  },
};
