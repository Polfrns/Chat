import { memo, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocalize, scheduleMessageContentLayoutReconcile } from '~/hooks';
import { ResponseGenerationTime } from './ResponseGenerationTimer';

type Expansion = { running: boolean; expanded: boolean };

const ResponseActivity = memo(function ResponseActivity({
  isSubmitting,
  children,
}: {
  isSubmitting: boolean;
  children: ReactNode;
}) {
  const localize = useLocalize();
  const contentId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [override, setOverride] = useState<Expansion | null>(null);
  // A user toggle applies to this phase. Finishing always folds the activity.
  const expanded = override?.running === isSubmitting ? override.expanded : isSubmitting;

  useEffect(() => scheduleMessageContentLayoutReconcile(rootRef.current), [expanded]);

  return (
    <div className="my-2 min-w-0" ref={rootRef} data-response-activity>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg py-2 text-sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setOverride({ running: isSubmitting, expanded: !expanded })}
      >
        {isSubmitting && (
          <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden="true" />
        )}
        <span>{localize('com_ui_response_activity')}</span>
        <ResponseGenerationTime />
        <ChevronDown
          className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div id={contentId} hidden={!expanded} className="border-l border-border-light pl-3">
        {children}
      </div>
    </div>
  );
});

export default ResponseActivity;
