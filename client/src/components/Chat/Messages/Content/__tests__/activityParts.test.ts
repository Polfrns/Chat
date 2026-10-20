import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { PartWithIndex } from '../ParallelContent';
import { partitionResponseParts } from '../activityParts';

const text = (value: string): TMessageContentParts => ({ type: ContentTypes.TEXT, text: value });
const tool = (name = 'list_files_mcp_drive'): TMessageContentParts => ({
  type: ContentTypes.TOOL_CALL,
  tool_call: { id: name, name, args: '{}', output: '' },
}) as TMessageContentParts;
const indexed = (parts: TMessageContentParts[]): PartWithIndex[] =>
  parts.map((part, idx) => ({ part, idx }));

describe('response activity partition', () => {
  it('keeps a plain answer visible without creating an activity block', () => {
    const parts = indexed([text('Answer')]);
    expect(partitionResponseParts(parts)).toEqual({ activity: [], answer: parts });
  });

  it('groups progress, reasoning and tools in order, keeping the final answer outside', () => {
    const parts = indexed([
      text('I will inspect the files.'),
      tool(),
      { type: ContentTypes.THINK, think: 'I found the document.' } as TMessageContentParts,
      text('I will validate it.'),
      tool('validate_file_mcp_drive'),
      text('Here is the answer.'),
    ]);
    const result = partitionResponseParts(parts);
    expect(result.activity).toEqual(parts.slice(0, 5));
    expect(result.answer).toEqual(parts.slice(5));
    expect(result.activity[1].part).toBe(parts[1].part);
  });

  it('keeps errors, handoffs and other output parts visible', () => {
    const parts = indexed([
      tool(),
      { type: ContentTypes.ERROR, error: 'Request failed' } as TMessageContentParts,
      tool(`${Constants.LC_TRANSFER_TO_}another_agent`),
      { type: ContentTypes.SUMMARY, content: 'Context summary' } as TMessageContentParts,
    ]);
    const result = partitionResponseParts(parts);
    expect(result.activity).toEqual([parts[0]]);
    expect(result.answer).toEqual(parts.slice(1));
  });

  it('accepts empty and unfinished tool parts without hiding content', () => {
    expect(partitionResponseParts([])).toEqual({ activity: [], answer: [] });
    const parts = indexed([{ type: ContentTypes.TOOL_CALL } as TMessageContentParts]);
    expect(partitionResponseParts(parts)).toEqual({ activity: [], answer: parts });
  });
});
