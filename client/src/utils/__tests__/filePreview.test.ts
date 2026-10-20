import { getFilePreviewKind } from '../filePreview';
import { transformMarkdownUrl } from '../markdownUrls';

test.each([
  ['report.pdf', 'pdf'], ['photo.png', 'image'], ['drawing.svg', 'image'],
  ['song.mp3', 'audio'], ['recording.webm', 'video'], ['script.py', 'text'],
  ['report.md', 'text'], ['data.json', 'text'], ['page.html', 'text'],
  ['archive.zip', null], ['program.exe', null], ['unrendered.docx', null],
])('classifies %s for a safe native viewer', (filename, expected) => {
  expect(getFilePreviewKind(filename)).toBe(expected);
});

test('recognizes normalized MIME types and renders HTML source as text', () => {
  expect(getFilePreviewKind('download', 'application/pdf; charset=binary')).toBe('pdf');
  expect(getFilePreviewKind('download', 'audio/mpeg')).toBe('audio');
  expect(getFilePreviewKind('page.html', 'text/html')).toBe('text');
});

test('preserves sandbox links while keeping the default URL safety boundary', () => {
  expect(transformMarkdownUrl('sandbox:/mnt/data/report.pdf', 'href')).toBe('/mnt/data/report.pdf');
  expect(transformMarkdownUrl('javascript:alert(1)', 'href')).toBe('');
  expect(transformMarkdownUrl('data:text/html,test', 'href')).toBe('');
  expect(transformMarkdownUrl('https://example.com', 'href')).toBe('https://example.com');
});
