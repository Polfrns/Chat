import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { documentParserMimeTypes } from 'librechat-data-provider';
import { parseDocument } from '~/files/documents/crud';
import { NextcloudError } from './webdav';

/** Characters returned per read. Keeps one tool result small enough for the model's context. */
export const READ_PAGE_CHARS: number = 50_000;

const DOCUMENT_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odt: 'application/vnd.oasis.opendocument.text',
};

/**
 * The document type the parser can read, or undefined. The file name decides first: Nextcloud often
 * answers `application/octet-stream` for files it does not recognize.
 */
export function documentMimeType(name: string, contentType: string): string | undefined {
  const byName = DOCUMENT_TYPES_BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''];
  const declared = contentType.split(';')[0].trim().toLowerCase();
  const candidate = byName ?? declared;
  return documentParserMimeTypes.some((pattern) => pattern.test(candidate)) ? candidate : undefined;
}

/** Text of a PDF or Office document. The parser works from a file, so the bytes go through a temp file. */
async function parseDocumentBytes(buffer: Buffer, name: string, mimetype: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'roko-nextcloud-'));
  const file = path.join(dir, `${randomUUID()}${path.extname(name).replace(/[^.\w]/g, '')}`);
  try {
    await fs.writeFile(file, buffer);
    const result = await parseDocument({
      file: {
        path: file,
        size: buffer.length,
        mimetype,
        originalname: name,
      } as Express.Multer.File,
    });
    return result.text;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new NextcloudError(`This document could not be read as text: ${reason}`, 422);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Readable text for a Nextcloud file: parsed for PDF and Office formats, decoded for plain text.
 * Anything else is binary and has to go through the file picker.
 */
export async function extractReadableText(
  buffer: Buffer,
  name: string,
  contentType: string,
): Promise<string> {
  const mimetype = documentMimeType(name, contentType);
  if (mimetype) {
    return parseDocumentBytes(buffer, name, mimetype);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new NextcloudError(
      'This is a binary file that cannot be read as text; attach it from the Nextcloud file picker',
    );
  }
  if (text.includes('\0')) {
    throw new NextcloudError('This is a binary file; use the Nextcloud file picker');
  }
  return text;
}

export interface TextPage {
  content: string;
  offset: number;
  /** Where the next read starts, or null when this page reaches the end. */
  next_offset: number | null;
  total_chars: number;
}

/** One page of `text` from character `offset`. Never splits a surrogate pair. */
export function pageText(text: string, offset?: number, pageChars?: number): TextPage {
  const start = offset ?? 0;
  const size = pageChars ?? READ_PAGE_CHARS;
  if (!Number.isInteger(start) || start < 0) {
    throw new NextcloudError('offset must be a non-negative integer');
  }
  if (start > text.length) {
    throw new NextcloudError('offset is past the end of the file');
  }
  let end = Math.min(text.length, start + size);
  const last = text.charCodeAt(end - 1);
  if (end < text.length && last >= 0xd800 && last <= 0xdbff) {
    end -= 1;
  }
  return {
    content: text.slice(start, end),
    offset: start,
    next_offset: end < text.length ? end : null,
    total_chars: text.length,
  };
}
