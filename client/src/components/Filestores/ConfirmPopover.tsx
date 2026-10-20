import * as Ariakit from '@ariakit/react';
import { Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';

export type ConfirmAnchor = { x: number; y: number };

/**
 * Small confirmation popup anchored at an arbitrary screen position (the drop
 * point or the pressed button), so the question appears where the action
 * happened. Dismissed by clicking anywhere else or pressing Escape.
 */
export default function ConfirmPopover({
  anchor,
  title,
  detail,
  confirmLabel,
  busy = false,
  onConfirm,
  onDismiss,
}: {
  anchor: ConfirmAnchor | null;
  title: string;
  detail?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const localize = useLocalize();
  if (anchor === null) {
    return null;
  }

  return (
    <Ariakit.PopoverProvider
      open
      setOpen={(open) => {
        if (!open && !busy) {
          onDismiss();
        }
      }}
    >
      <Ariakit.Popover
        portal
        gutter={6}
        getAnchorRect={() => ({ x: anchor.x, y: anchor.y, width: 1, height: 1 })}
        className="z-[100] w-64 rounded-lg border border-border-medium bg-surface-primary p-3 shadow-lg"
        aria-label={title}
      >
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {detail ? <p className="mt-1 break-all text-xs text-text-secondary">{detail}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
            onClick={onDismiss}
            disabled={busy}
          >
            {localize('com_ui_cancel')}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-surface-submit px-2 py-1 text-xs text-white hover:bg-surface-submit-hover disabled:opacity-60"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner className="h-3 w-3" /> : null}
            {confirmLabel}
          </button>
        </div>
      </Ariakit.Popover>
    </Ariakit.PopoverProvider>
  );
}
