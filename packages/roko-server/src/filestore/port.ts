import type { FileEntry, SearchHit } from '../types';
import { ReadOnlyError } from '../errors';

/**
 * The FileStore port — the *intersection* of what every backend can do, not the
 * richness of any one of them. Tools and the core service speak only this; which
 * backend answers (local fs, Graph drive) is invisible above the adapter line.
 *
 * These are the primitives. Richer operations (line-range reads, in-place edits)
 * belong here later as DEFAULT methods implemented over `readWhole`/`writeWhole`
 * — working on every backend — which an adapter MAY override for native
 * efficiency. We don't add them until a tool needs one (a seam, not a cathedral).
 */
export abstract class FileStore {
  constructor(readonly readOnly: boolean) {}

  /** Recursive listing relative to root; directories included (empty ones too). */
  abstract list(subdir?: string): Promise<FileEntry[]>;
  abstract readWhole(filePath: string): Promise<string>;
  abstract writeWhole(filePath: string, content: string): Promise<string>;
  abstract mkdir(dirPath: string): Promise<string>;
  abstract move(src: string, dst: string): Promise<string>;
  abstract searchLiteral(query: string, maxResults?: number): Promise<SearchHit[]>;

  protected assertWritable(): void {
    if (this.readOnly) {
      throw new ReadOnlyError('Filestore is read-only');
    }
  }
}
