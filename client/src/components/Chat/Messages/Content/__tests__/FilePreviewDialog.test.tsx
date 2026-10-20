import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import FilePreviewDialog from '../FilePreviewDialog';

const mockDownload = jest.fn(async () => ({ data: 'blob:download' }));
jest.mock('recoil', () => ({ useRecoilValue: () => ({ id: 'user-id' }) }));
jest.mock('~/store', () => ({ __esModule: true, default: { user: 'user' } }));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/data-provider', () => ({ useFileDownload: () => ({ refetch: mockDownload }) }));
jest.mock('~/utils', () => ({
  logger: { error: jest.fn() }, sortPagesByRelevance: (pages: number[]) => pages,
  triggerDownload: jest.fn(),
}));
jest.mock('~/components/Messages/Content/CopyButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@librechat/client', () => ({
  OGDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => open ? <>{children}</> : null,
  OGDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  OGDialogTitle: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
  OGDialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
}));

const base = { open: true, onOpenChange: jest.fn(), fileName: 'report.docx', fileId: 'doc-id' };

test('converted Office HTML is isolated without scripts or same-origin permission', async () => {
  render(<FilePreviewDialog {...base} previewText="<p>Office preview</p>" previewTextFormat="html" />);
  const frame = await screen.findByTitle('com_ui_preview: report.docx');
  expect(frame).toHaveAttribute('sandbox', '');
  expect(frame).toHaveAttribute('srcdoc', '<p>Office preview</p>');
  expect(mockDownload).not.toHaveBeenCalled();
});

test('extracted plain text never becomes executable preview HTML', async () => {
  render(<FilePreviewDialog {...base} previewText="<script>private()</script>" previewTextFormat="text" />);
  await waitFor(() => expect(screen.getByText('<script>private()</script>')).toBeVisible());
  expect(screen.queryByTitle('com_ui_preview: report.docx')).toBeNull();
});
