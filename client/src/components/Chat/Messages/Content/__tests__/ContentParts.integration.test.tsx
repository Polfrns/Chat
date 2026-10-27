import React from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import ContentParts from '../ContentParts';
import ActivityParts from '../ActivityParts';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  scheduleMessageContentLayoutReconcile: jest.fn(() => jest.fn()),
}));
jest.mock('~/utils', () => ({
  mapAttachments: (attachments: TAttachment[]) => Object.fromEntries(
    attachments.map((attachment) => [attachment.toolCallId, [attachment]]),
  ),
}));
jest.mock('~/Providers', () => ({
  MessageContext: { Provider: ({ children }: React.PropsWithChildren) => <>{children}</> },
  SearchContext: { Provider: ({ children }: React.PropsWithChildren) => <>{children}</> },
}));
jest.mock('../Parts', () => ({
  AttachmentGroup: ({ attachments }: { attachments?: TAttachment[] }) =>
    attachments?.length ? <div data-testid="attachments">{attachments.map((item) => item.filename).join(', ')}</div> : null,
  EditTextPart: () => null,
  EmptyText: () => null,
}));
jest.mock('../Parts/PendingSkillCall', () => ({ __esModule: true, default: () => null }));
jest.mock('../MemoryArtifacts', () => ({ __esModule: true, default: () => null }));
jest.mock('../Container', () => ({
  __esModule: true, default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../Part', () => ({
  __esModule: true,
  default: ({ part, hideAttachments, inActivityGroup }: {
    part: TMessageContentParts; hideAttachments?: boolean; inActivityGroup?: boolean;
  }) => (
    <div data-testid={part.type} data-hide-attachments={String(!!hideAttachments)}
      data-inline={String(!!inActivityGroup)}>
      {part.type === 'text' && typeof part.text === 'string' ? part.text : part.type}
    </div>
  ),
}));
jest.mock('../ParallelContent', () => ({
  ParallelContentRenderer: () => <div data-testid="parallel-renderer" />,
}));

const tool = (id: string): TMessageContentParts => ({
  type: ContentTypes.TOOL_CALL,
  tool_call: { id, name: 'read_file_mcp_drive', args: '{}', output: 'ok' },
}) as TMessageContentParts;
const text = (value: string): TMessageContentParts => ({ type: ContentTypes.TEXT, text: value });
const attachment = (toolCallId: string, filename = 'document.pdf'): TAttachment => ({
  toolCallId, filename, filepath: '/files/document.pdf', messageId: 'm1', conversationId: 'c1',
}) as TAttachment;
const baseProps = {
  messageId: 'm1', isCreatedByUser: false, isLast: true,
  isSubmitting: false, isLatestMessage: true,
};

describe('response activity integration', () => {
  it('keeps the answer and tool attachments visible after folding activity', () => {
    render(<ContentParts {...baseProps}
      content={[text('I will read the document.'), tool('t1'), text('The answer.')]}
      attachments={[attachment('t1')]} />);
    expect(screen.getByText('I will read the document.')).not.toBeVisible();
    expect(screen.getByText('The answer.')).toBeVisible();
    expect(screen.getByText('document.pdf')).toBeVisible();
    expect(screen.getByTestId(ContentTypes.TOOL_CALL)).toHaveAttribute('data-hide-attachments', 'true');
    expect(screen.getByTestId(ContentTypes.TOOL_CALL)).toHaveAttribute('data-inline', 'true');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('I will read the document.')).toBeVisible();
  });

  it('hoists attachments for one tool as well as multiple tools without duplicates', () => {
    render(<ContentParts {...baseProps}
      content={[tool('t1'), tool('t2')]}
      attachments={[attachment('t1', 'a.pdf'), attachment('t2', 'b.png')]} />);
    expect(screen.getAllByTestId('attachments')).toHaveLength(1);
    expect(screen.getByText('a.pdf, b.png')).toBeVisible();
  });

  it('keeps bridge output attachments and errors outside the disclosure', () => {
    render(<ContentParts {...baseProps}
      content={[tool('t1'), { type: ContentTypes.ERROR, error: 'Failed' } as TMessageContentParts]}
      attachments={[attachment('bridge-output-0')]} />);
    expect(screen.getByText('document.pdf')).toBeVisible();
    expect(screen.getByTestId(ContentTypes.ERROR)).toBeVisible();
  });

  it('updates live activity and folds it when the response finishes', () => {
    const content = [tool('t1'), { type: ContentTypes.THINK, think: 'Public progress' } as TMessageContentParts];
    const { rerender } = render(<ContentParts {...baseProps} content={content} isSubmitting />);
    expect(screen.getByTestId(ContentTypes.THINK)).toBeVisible();
    rerender(<ContentParts {...baseProps} content={[...content, text('Finished answer')]} />);
    expect(screen.getByTestId(ContentTypes.THINK)).not.toBeVisible();
    expect(screen.getByText('Finished answer')).toBeVisible();
  });

  it('does not group user messages', () => {
    render(<ContentParts {...baseProps} isCreatedByUser content={[text('Question')]} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Question')).toBeVisible();
  });

  it('keeps activity isolated between parallel columns', () => {
    const renderPart = (part: TMessageContentParts, idx: number) =>
      <div key={idx}>{part.type === ContentTypes.TEXT && typeof part.text === 'string' ? part.text : part.type}</div>;
    const indexed = (parts: TMessageContentParts[]) => parts.map((part, idx) => ({ part, idx }));
    render(<>
      <ActivityParts parts={indexed([tool('a'), text('Answer A')])} isSubmitting={false}
        lastContentIdx={1} renderPart={renderPart} />
      <ActivityParts parts={indexed([tool('b'), text('Answer B')])} isSubmitting
        lastContentIdx={1} renderPart={renderPart} />
    </>);
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-expanded')))
      .toEqual(['false', 'true']);
    expect(screen.getByText('Answer A')).toBeVisible();
    expect(screen.getByText('Answer B')).toBeVisible();
  });
});
