import { useMemo, useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useToastContext } from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import { NativeTypes } from 'react-dnd-html5-backend';
import { ChevronRight, Download, FileText, Folder, FolderOpen, Upload } from 'lucide-react';
import type { TFilestoreFile } from 'librechat-data-provider';
import type { ConfirmAnchor } from './ConfirmPopover';
import {
  useFilestoreFilesQuery,
  useMoveFilestoreFileMutation,
  useUploadFilestoreFileMutation,
} from '~/data-provider';
import ConfirmPopover from './ConfirmPopover';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const NODE_TYPE = 'filestore-node';

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  bytes?: number;
  children: TreeNode[];
};

type DragNode = { path: string; name: string; isFolder: boolean };

type PendingAction =
  | { kind: 'upload'; dir: string; files: File[]; anchor: ConfirmAnchor }
  | { kind: 'move'; node: DragNode; dstDir: string; anchor: ConfirmAnchor };

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortNodes(node.children);
    }
  }
}

/** Build a nested folder/file tree from flat store-relative paths. */
function buildTree(files: TFilestoreFile[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  const ensureFolder = (path: string): TreeNode => {
    const existing = byPath.get(path);
    if (existing) {
      return existing;
    }
    const parts = path.split('/');
    const node: TreeNode = {
      name: parts[parts.length - 1],
      path,
      isFolder: true,
      children: [],
    };
    byPath.set(path, node);
    if (parts.length === 1) {
      roots.push(node);
    } else {
      ensureFolder(parts.slice(0, -1).join('/')).children.push(node);
    }
    return node;
  };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    if (file.type === 'dir') {
      ensureFolder(file.path);
      continue;
    }
    const node: TreeNode = {
      name: parts[parts.length - 1],
      path: file.path,
      isFolder: false,
      bytes: file.bytes,
      children: [],
    };
    if (parts.length === 1) {
      roots.push(node);
    } else {
      ensureFolder(parts.slice(0, -1).join('/')).children.push(node);
    }
  }

  sortNodes(roots);
  return roots;
}

const parentDir = (path: string) => path.split('/').slice(0, -1).join('/');

/** Whether `node` may be dropped into `dstDir` (no-op and folder-into-itself moves rejected). */
function canMoveInto(node: DragNode, dstDir: string): boolean {
  if (parentDir(node.path) === dstDir) {
    return false;
  }
  return !node.isFolder || (dstDir !== node.path && !dstDir.startsWith(`${node.path}/`));
}

type TreeCallbacks = {
  readOnly: boolean;
  onDownload: (node: TreeNode) => void;
  onDropNode: (node: DragNode, dstDir: string, anchor: ConfirmAnchor) => void;
  onDropFiles: (files: File[], dir: string, anchor: ConfirmAnchor) => void;
};

/** Drop-target plumbing shared by folder rows and the root container: accepts
 *  in-store nodes (move) and OS files (upload), anchoring the confirmation at
 *  the pointer's drop position. */
function useTreeDrop(dir: string, callbacks: TreeCallbacks, ownPath?: string) {
  return useDrop(
    () => ({
      accept: [NODE_TYPE, NativeTypes.FILE],
      canDrop: (item: DragNode | { files: File[] }, monitor) => {
        if (callbacks.readOnly) {
          return false;
        }
        if (monitor.getItemType() === NODE_TYPE) {
          return canMoveInto(item as DragNode, dir);
        }
        return true;
      },
      drop: (item: DragNode | { files: File[] }, monitor) => {
        if (monitor.didDrop()) {
          return;
        }
        const offset = monitor.getClientOffset();
        const anchor = { x: offset?.x ?? 0, y: offset?.y ?? 0 };
        if (monitor.getItemType() === NODE_TYPE) {
          callbacks.onDropNode(item as DragNode, dir, anchor);
          return;
        }
        const files = (item as { files: File[] }).files.filter((file) => file.size > 0);
        if (files.length > 0) {
          callbacks.onDropFiles(files, dir, anchor);
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
      }),
    }),
    [dir, ownPath, callbacks.readOnly],
  );
}

function TreeNodeView({
  node,
  depth,
  callbacks,
}: {
  node: TreeNode;
  depth: number;
  callbacks: TreeCallbacks;
}) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: `${depth * 12 + 4}px` };

  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: NODE_TYPE,
      item: { path: node.path, name: node.name, isFolder: node.isFolder } satisfies DragNode,
      canDrag: !callbacks.readOnly,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [node.path, node.name, node.isFolder, callbacks.readOnly],
  );
  const [{ isOver }, dropRef] = useTreeDrop(node.isFolder ? node.path : '', callbacks, node.path);

  if (!node.isFolder) {
    return (
      <div
        ref={dragRef}
        className={cn(
          'group flex items-center gap-1 rounded px-1 py-0.5 text-xs text-text-secondary',
          isDragging && 'opacity-40',
        )}
        style={indent}
      >
        <span className="h-3 w-3 shrink-0" aria-hidden="true" />
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{node.name}</span>
        <button
          type="button"
          aria-label={localize('com_roko_download_file')}
          title={localize('com_roko_download_file')}
          onClick={() => callbacks.onDownload(node)}
          className="ml-auto hidden shrink-0 rounded p-0.5 hover:bg-surface-hover hover:text-text-primary group-hover:block"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div ref={dropRef} className={cn(isOver && 'rounded bg-surface-active')}>
      <button
        ref={dragRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-text-primary hover:bg-surface-hover',
          isDragging && 'opacity-40',
        )}
        style={indent}
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open
        ? node.children.map((child) => (
            <TreeNodeView key={child.path} node={child} depth={depth + 1} callbacks={callbacks} />
          ))
        : null}
    </div>
  );
}

const requestError = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || fallback;
};

/**
 * Live file tree for a single filestore: folders collapsed by default; polls
 * while `active` so the tree reflects writes made by the drive tools. Files can
 * be downloaded, uploaded (button or OS drag-drop), and moved (row drag-drop);
 * uploads and moves are confirmed via a popup anchored at the action position.
 */
export default function FilestoreTree({
  filestoreUid,
  active,
  readOnly = false,
}: {
  filestoreUid: string;
  active: boolean;
  readOnly?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useFilestoreFilesQuery(active ? filestoreUid : null, {
    refetchInterval: active ? 4000 : false,
  });
  const uploadMutation = useUploadFilestoreFileMutation(filestoreUid);
  const moveMutation = useMoveFilestoreFileMutation(filestoreUid);

  const tree = useMemo(() => buildTree(data?.files ?? []), [data]);

  const download = async (node: TreeNode) => {
    try {
      const response = await dataService.getFilestoreFileDownload(filestoreUid, node.path);
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = node.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast({
        status: 'error',
        message: requestError(error, localize('com_roko_download_failed')),
      });
    }
  };

  const callbacks: TreeCallbacks = {
    readOnly,
    onDownload: download,
    onDropNode: (node, dstDir, anchor) => setPending({ kind: 'move', node, dstDir, anchor }),
    onDropFiles: (files, dir, anchor) => setPending({ kind: 'upload', dir, files, anchor }),
  };

  const [{ isOver: isOverRoot }, rootDropRef] = useTreeDrop('', callbacks);

  const confirmPending = async () => {
    if (!pending) {
      return;
    }
    setBusy(true);
    try {
      if (pending.kind === 'upload') {
        for (const file of pending.files) {
          const path = pending.dir ? `${pending.dir}/${file.name}` : file.name;
          await uploadMutation.mutateAsync({ path, file });
        }
      } else {
        const dst = pending.dstDir ? `${pending.dstDir}/${pending.node.name}` : pending.node.name;
        await moveMutation.mutateAsync({ src: pending.node.path, dst });
      }
      setPending(null);
    } catch (error) {
      showToast({
        status: 'error',
        message: requestError(
          error,
          pending.kind === 'upload'
            ? localize('com_roko_upload_failed')
            : localize('com_roko_move_failed'),
        ),
      });
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const pendingTitle =
    pending?.kind === 'upload'
      ? localize('com_roko_upload_confirm')
      : localize('com_roko_move_confirm');
  const describePending = (action: PendingAction): string => {
    if (action.kind === 'upload') {
      return `${action.files.map((file) => file.name).join(', ')} → ${action.dir || '/'}`;
    }
    return `${action.node.path} → ${action.dstDir || '/'}`;
  };
  const pendingDetail = pending ? describePending(pending) : undefined;

  return (
    <div
      ref={rootDropRef}
      className={cn('mt-0.5 flex min-h-8 flex-col', isOverRoot && 'rounded bg-surface-active')}
    >
      {!readOnly ? (
        <div className="flex justify-end">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const rect = fileInputRef.current?.parentElement?.getBoundingClientRect();
              if (files.length > 0) {
                setPending({
                  kind: 'upload',
                  dir: '',
                  files,
                  anchor: { x: rect?.right ?? 0, y: rect?.bottom ?? 0 },
                });
              }
              event.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label={localize('com_roko_upload_file')}
            title={localize('com_roko_upload_file')}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_roko_upload_file')}
          </button>
        </div>
      ) : null}

      {isLoading && tree.length === 0 ? (
        <p className="px-2 py-1 text-xs text-text-secondary">{localize('com_roko_loading')}</p>
      ) : null}
      {!isLoading && tree.length === 0 ? (
        <p className="px-2 py-1 text-xs text-text-secondary">{localize('com_roko_no_files')}</p>
      ) : null}
      {tree.map((node) => (
        <TreeNodeView key={node.path} node={node} depth={0} callbacks={callbacks} />
      ))}

      <ConfirmPopover
        anchor={pending?.anchor ?? null}
        title={pendingTitle}
        detail={pendingDetail}
        confirmLabel={
          pending?.kind === 'move' ? localize('com_roko_move') : localize('com_roko_upload')
        }
        busy={busy}
        onConfirm={confirmPending}
        onDismiss={() => setPending(null)}
      />
    </div>
  );
}
