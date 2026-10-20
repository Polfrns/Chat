import { memo, useMemo } from 'react';
import { parseBridgeToolRecords } from './bridgeToolRecords';
import { bridgeActivityOutput } from './bridgeActivityDetails';
import { Reasoning } from './Parts';
import ToolCall from './ToolCall';
import BridgeToolTime from './BridgeToolTime';

/** Exactly the same ToolCall cards used by MCP, populated with read-only Bridge events.
 *  Never routes these to the tool executor: Codex/Claude already ran them. */
type BridgeToolReasoningProps = {
  reasoning: string;
  isLast: boolean;
  isSubmitting: boolean;
  inline?: boolean;
};

const BridgeToolReasoning = memo(function BridgeToolReasoning({
  reasoning,
  isLast,
  isSubmitting,
  inline = false,
}: BridgeToolReasoningProps) {
  const { entries } = useMemo(() => parseBridgeToolRecords(reasoning), [reasoning]);
  return (
    <>
      {entries.map((entry, index) => {
        if (entry.kind === 'text') {
          return (
            <Reasoning
              key={`progress-${index}`}
              reasoning={entry.text}
              isLast={isLast && index === entries.length - 1}
              inline={inline}
            />
          );
        }
        const { tool } = entry;
        return (
          <div key={tool.id} className="my-1" data-bridge-state={tool.state}>
            <BridgeToolTime tool={tool} running={isSubmitting && tool.state === 'started'} />
            <ToolCall
              name={`${tool.label}${tool.filename ? ` ${tool.filename}` : ''}_mcp_${tool.provider === 'codex' ? 'Codex' : tool.provider === 'claude' ? 'Claude' : 'Bridge'}`}
              args=""
              output={bridgeActivityOutput(tool)}
              initialProgress={['started', 'cancelled'].includes(tool.state) ? 0.1 : 1}
              isSubmitting={isSubmitting && tool.state === 'started'}
              isLast={isLast}
            />
          </div>
        );
      })}
    </>
  );
});
export default BridgeToolReasoning;
