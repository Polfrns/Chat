import type { TAttachment } from 'librechat-data-provider';
import { resolveMessageDownload } from '../messageFileLinks';

const file = (file_id: string, filename: string): TAttachment => ({
  file_id, filename, filepath: `/uploads/${file_id}`, user: 'user-1', source: 'local',
}) as TAttachment;

test('resolves each generated document against the files of that response', () => {
  const attachments = [file('a', 'Report.pdf'), file('b', 'Budget.xlsx')];
  expect(resolveMessageDownload('sandbox:/mnt/data/outputs/Report.pdf', attachments)?.fileId).toBe('a');
  expect(resolveMessageDownload('outputs/Budget.xlsx', attachments)?.fileId).toBe('b');
  expect(resolveMessageDownload('/uploads/b', attachments)?.fileId).toBe('b');
  expect(resolveMessageDownload('outputs/Missing.docx', attachments)).toBeNull();
  expect(resolveMessageDownload('outputs/Report.pdf', [])).toBeNull();
});

test('decodes names, deduplicates identical file IDs and refuses ambiguous basenames', () => {
  const first = file('a', 'My report.pdf');
  expect(resolveMessageDownload('outputs/My%20report.pdf', [first, first])?.fileId).toBe('a');
  const nested = [file('a', 'one/report.pdf'), file('b', 'two/report.pdf')];
  expect(resolveMessageDownload('outputs/report.pdf', nested)).toBeNull();
  expect(resolveMessageDownload('one/report.pdf', nested)?.fileId).toBe('a');
});

test('does not hijack external links or accept malformed or traversal references', () => {
  const attachments = [file('a', 'report.pdf')];
  for (const href of ['https://example.com/report.pdf', '//example.com/report.pdf',
    'javascript:report.pdf', '../report.pdf', '/outputs/%2e%2e/report.pdf', 'outputs/%ZZ']) {
    expect(resolveMessageDownload(href, attachments)).toBeNull();
  }
});

test('retains the reference after the server sanitizes a generated filename', () => {
  const saved = { ...file('a', 'My_report.pdf'), metadata: { originalFilename: 'My report.pdf' } } as TAttachment;
  expect(resolveMessageDownload('sandbox:/mnt/data/My%20report.pdf', [saved])?.fileId).toBe('a');
});
