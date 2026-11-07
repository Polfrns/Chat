import fs from 'node:fs';
import { parseDocument } from '~/files/documents/crud';
import { documentMimeType, extractReadableText, pageText, READ_PAGE_CHARS } from './read';

jest.mock('~/files/documents/crud', () => ({ parseDocument: jest.fn() }));

const parse = parseDocument as jest.Mock;

describe('Nextcloud readable text', () => {
  beforeEach(() => parse.mockReset());

  describe('documentMimeType', () => {
    it.each([
      ['informe.PDF', 'application/octet-stream', 'application/pdf'],
      [
        'acta.docx',
        'application/octet-stream',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      ['datos.xlsx', '', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['sin-extension', 'application/pdf; charset=binary', 'application/pdf'],
    ])('%s (%s)', (name, contentType, expected) => {
      expect(documentMimeType(name, contentType)).toBe(expected);
    });

    it.each([
      ['notas.txt', 'text/plain'],
      ['foto.png', 'image/png'],
      ['archivo.zip', 'application/zip'],
    ])('does not treat %s as a document', (name, contentType) => {
      expect(documentMimeType(name, contentType)).toBeUndefined();
    });
  });

  describe('extractReadableText', () => {
    it('parses a PDF from a temporary file and removes it afterwards', async () => {
      let seen = '';
      parse.mockImplementation(async ({ file }: { file: { path: string; mimetype: string } }) => {
        seen = file.path;
        expect(fs.readFileSync(file.path).toString()).toBe('%PDF-bytes');
        expect(file.mimetype).toBe('application/pdf');
        return { text: 'texto del pdf' };
      });

      const text = await extractReadableText(
        Buffer.from('%PDF-bytes'),
        'informe.pdf',
        'application/octet-stream',
      );

      expect(text).toBe('texto del pdf');
      expect(fs.existsSync(seen)).toBe(false);
    });

    it('turns a parser failure into a clear error and still removes the temporary file', async () => {
      let seen = '';
      parse.mockImplementation(async ({ file }: { file: { path: string } }) => {
        seen = file.path;
        throw new Error('No text found in document');
      });

      await expect(extractReadableText(Buffer.from('x'), 'vacio.pdf', '')).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('No text found'),
      });
      expect(fs.existsSync(seen)).toBe(false);
    });

    it('decodes plain text without calling the parser', async () => {
      expect(await extractReadableText(Buffer.from('héllo'), 'a.txt', 'text/plain')).toBe('héllo');
      expect(parse).not.toHaveBeenCalled();
    });

    it('refuses binary content', async () => {
      await expect(
        extractReadableText(Buffer.from([0xff, 0xfe, 0x00]), 'a.bin', ''),
      ).rejects.toThrow('binary');
      await expect(extractReadableText(Buffer.from('a\0b'), 'a.bin', '')).rejects.toThrow('binary');
    });
  });

  describe('pageText', () => {
    const text = 'a'.repeat(READ_PAGE_CHARS * 2 + 10);

    it('returns the first page and where to continue', () => {
      const page = pageText(text);
      expect(page.content).toHaveLength(READ_PAGE_CHARS);
      expect(page.next_offset).toBe(READ_PAGE_CHARS);
      expect(page.total_chars).toBe(text.length);
    });

    it('walks the whole text page by page and ends with a null next_offset', () => {
      let offset: number | null = 0;
      let joined = '';
      while (offset !== null) {
        const page = pageText(text, offset);
        joined += page.content;
        offset = page.next_offset;
      }
      expect(joined).toBe(text);
    });

    it('does not split a surrogate pair at a page boundary', () => {
      const emoji = '😀'.repeat(5);
      const page = pageText(emoji, 0, 3);
      expect(page.content).toBe('😀');
      expect(page.next_offset).toBe(2);
    });

    it.each([-1, 1.5, 11])('rejects offset %s', (offset) => {
      expect(() => pageText('0123456789', offset)).toThrow('offset');
    });
  });
});
