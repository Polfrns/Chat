import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from './port';
import { TraversalError } from '../errors';
import type { FileEntry, SearchHit } from '../types';

const DEFAULT_SEARCH_LIMIT = 50;
const SNIPPET_MAX = 200;

/** A single drive rooted at an absolute path, with a hard traversal guard and
 *  read-only enforcement. The `LocalFileStore` adapter for the FileStore port. */
export class LocalFileStore extends FileStore {
  private readonly root: string;

  constructor(root: string, readOnly: boolean) {
    super(readOnly);
    this.root = path.resolve(root);
  }

  /** Resolve a store-relative path, rejecting anything that escapes the root. */
  private safe(rel: string): string {
    const cleaned = String(rel ?? '').replace(/^[/\\]+/, '');
    const abs = path.resolve(this.root, cleaned);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new TraversalError(`Path escapes the filestore root: ${rel}`);
    }
    return abs;
  }

  async list(subdir = ''): Promise<FileEntry[]> {
    const base = this.safe(subdir);
    const out: FileEntry[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        throw error;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        const stat = await fs.promises.stat(abs);
        const rel = path.relative(this.root, abs);
        if (entry.isDirectory()) {
          out.push({ path: rel, bytes: 0, mtimeMs: stat.mtimeMs, type: 'dir' });
          await walk(abs);
        } else if (entry.isFile()) {
          out.push({ path: rel, bytes: stat.size, mtimeMs: stat.mtimeMs, type: 'file' });
        }
      }
    };
    await walk(base);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readWhole(filePath: string): Promise<string> {
    return fs.promises.readFile(this.safe(filePath), 'utf8');
  }

  async writeWhole(filePath: string, content: string): Promise<string> {
    this.assertWritable();
    const abs = this.safe(filePath);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content);
    return path.relative(this.root, abs);
  }

  async mkdir(dirPath: string): Promise<string> {
    this.assertWritable();
    const abs = this.safe(dirPath);
    await fs.promises.mkdir(abs, { recursive: true });
    return path.relative(this.root, abs);
  }

  async move(src: string, dst: string): Promise<string> {
    this.assertWritable();
    const from = this.safe(src);
    const to = this.safe(dst);
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.rename(from, to);
    return path.relative(this.root, to);
  }

  async searchLiteral(query: string, maxResults = DEFAULT_SEARCH_LIMIT): Promise<SearchHit[]> {
    const needle = String(query ?? '');
    const hits: SearchHit[] = [];
    if (!needle) {
      return hits;
    }
    for (const entry of await this.list()) {
      if (entry.type !== 'file') {
        continue;
      }
      let text: string;
      try {
        text = await this.readWhole(entry.path);
      } catch {
        continue; // skip binary / unreadable
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes(needle)) {
          hits.push({ path: entry.path, line: i + 1, snippet: lines[i]!.trim().slice(0, SNIPPET_MAX) });
          if (hits.length >= maxResults) {
            return hits;
          }
        }
      }
    }
    return hits;
  }
}
