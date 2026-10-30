import { memo, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { PartWithIndex } from './ParallelContent';
import { useResponseGenerationElapsed } from './ResponseGenerationTimer';
import { partitionResponseParts } from './responseParts';
import ResponseActivity from './ResponseActivity';
import { AttachmentGroup } from './Parts';

type PartRenderer = (part: TMessageContentParts, idx: number, isLast: boolean) => ReactNode;

const ActivityParts = memo(function ActivityParts({
  parts,
  isSubmitting,
  lastContentIdx,
  renderPart,
  renderActivityPart = renderPart,
  attachments,
  showWhenEmpty = false,
}: {
  parts: PartWithIndex[];
  isSubmitting: boolean;
  lastContentIdx: number;
  renderPart: PartRenderer;
  renderActivityPart?: PartRenderer;
  attachments?: TAttachment[];
  showWhenEmpty?: boolean;
}) {
  const elapsed = useResponseGenerationElapsed();
  const { activity, answer } = useMemo(() => partitionResponseParts(parts), [parts]);
  const activityAttachments = useMemo(() => {
    const ids = new Set(
      activity
        .map(({ part }) =>
          part.type === ContentTypes.TOOL_CALL ? part[ContentTypes.TOOL_CALL]?.id : undefined,
        )
        .filter(Boolean),
    );
    return attachments?.filter((attachment) => ids.has(attachment.toolCallId)) ?? [];
  }, [activity, attachments]);

  return (
    <>
      {(activity.length > 0 || (showWhenEmpty && (isSubmitting || elapsed !== undefined))) && (
        <ResponseActivity isSubmitting={isSubmitting}>
          {activity.map(({ part, idx }) => renderActivityPart(part, idx, idx === lastContentIdx))}
        </ResponseActivity>
      )}
      {activityAttachments.length > 0 && <AttachmentGroup attachments={activityAttachments} />}
      {answer.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))}
    </>
  );
});

export default ActivityParts;
