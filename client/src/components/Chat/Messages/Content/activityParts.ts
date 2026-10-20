import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { PartWithIndex } from './ParallelContent';

export type ResponseParts = {
  activity: PartWithIndex[];
  answer: PartWithIndex[];
};

function isActivity({ part }: PartWithIndex): boolean {
  if (part.type === ContentTypes.THINK) {
    return true;
  }
  if (part.type !== ContentTypes.TOOL_CALL) {
    return false;
  }
  const tool = part[ContentTypes.TOOL_CALL];
  if (!tool) {
    return false;
  }
  const isFunction = 'args' in tool && (!tool.type || tool.type === ToolCallTypes.TOOL_CALL);
  return !(isFunction && tool.name?.startsWith(Constants.LC_TRANSFER_TO_));
}

/** Text preceding further work is progress commentary; trailing text is the answer.
 * Errors, handoffs and other visible outputs always stay outside the disclosure. */
export function partitionResponseParts(parts: PartWithIndex[]): ResponseParts {
  const lastActivity = parts.findLastIndex(isActivity);
  const activity: PartWithIndex[] = [];
  const answer: PartWithIndex[] = [];
  parts.forEach((item, position) => {
    const isCommentary = position <= lastActivity && item.part.type === ContentTypes.TEXT;
    (isActivity(item) || isCommentary ? activity : answer).push(item);
  });
  return { activity, answer };
}
