import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import { a as MarkdownAnchor } from '../MarkdownComponents';

const mockDownload = jest.fn(async () => ({ data: 'blob:document' }));
const mockUrlDownload = jest.fn();
const mockTriggerDownload = jest.fn();
const mockAttachments = [{
  file_id: 'pdf-id', filename: 'report.pdf', filepath: '/uploads/stored.pdf',
  user: 'user-id', source: 'local',
}] as TAttachment[];

jest.mock('recoil', () => ({ useRecoilValue: () => ({ id: 'user-id' }) }));
jest.mock('~/store', () => ({ __esModule: true, default: { user: 'user' } }));
jest.mock('@librechat/client', () => ({ useToastContext: () => ({ showToast: jest.fn() }) }));
jest.mock('~/components/Messages/Content/Mermaid', () => ({ __esModule: true, default: () => null, MermaidErrorBoundary: () => null }));
jest.mock('~/components/Messages/Content/CodeBlock', () => ({ __esModule: true, default: () => null }));
jest.mock('~/hooks/Roles/useHasAccess', () => ({ __esModule: true, default: () => false }));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/Providers', () => ({
  useMessageContext: () => ({ attachments: mockAttachments }),
  useCodeBlockContext: () => ({}),
}));
jest.mock('~/data-provider', () => ({
  useFileDownload: () => ({ refetch: mockDownload }),
  useCodeOutputDownload: () => ({ refetch: mockUrlDownload }),
}));
jest.mock('~/utils', () => ({
  triggerDownload: (...args: unknown[]) => mockTriggerDownload(...args),
  isHttpDownloadTarget: () => false,
  handleDoubleClick: () => undefined,
}));

test('clicking a generated-document link downloads the corresponding stored file', async () => {
  render(<MarkdownAnchor href="/mnt/data/outputs/report.pdf">Download report</MarkdownAnchor>);
  const link = screen.getByRole('link');
  expect(link.getAttribute('href')).toContain('/api/files/download/user-id/pdf-id');
  fireEvent.click(link);
  await waitFor(() => expect(mockTriggerDownload).toHaveBeenCalledWith('blob:document', 'report.pdf'));
  expect(mockDownload).toHaveBeenCalledTimes(1);
  expect(mockUrlDownload).not.toHaveBeenCalled();
});

test('normal external links retain their destination', () => {
  render(<MarkdownAnchor href="https://example.com/report.pdf">Website</MarkdownAnchor>);
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/report.pdf');
});
