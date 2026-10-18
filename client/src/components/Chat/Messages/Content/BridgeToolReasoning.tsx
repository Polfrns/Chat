import { memo, useMemo } from 'react';
import { parseBridgeToolRecords } from './bridgeToolRecords';
import { Reasoning } from './Parts';
import ToolCall from './ToolCall';

/** Exactly the same ToolCall cards used by MCP, populated with read-only Bridge events.
 *  Never routes these to the tool executor: Codex/Claude already ran them. */
const BridgeToolReasoning = memo(function BridgeToolReasoning({ reasoning, isLast, isSubmitting }: {
  reasoning: string; isLast: boolean; isSubmitting: boolean;
}) {
  const { text, tools } = useMemo(() => parseBridgeToolRecords(reasoning), [reasoning]);
  if (!tools.length) return text ? <Reasoning reasoning={text} isLast={isLast} /> : null;
  return (
    <>
      {tools.map((tool) => (
        <div key={tool.id} className="my-1" data-bridge-state={tool.state}>
        {(tool.durationMs !== undefined || tool.attempt || tool.state==='cancelled') && <div className="text-xs text-text-secondary" role="status">
          {tool.state==='cancelled' ? 'Cancelada · ' : ''}
          {tool.attempt && tool.attempt>1 ? `Reintento ${tool.attempt-1} · ` : ''}
          {tool.durationMs !== undefined ? `${(tool.durationMs/1000).toLocaleString('es-ES',{maximumFractionDigits:2})} s` : ''}
        </div>}
        <ToolCall
          key={tool.id}
          name={`${tool.label}${tool.filename ? ` ${tool.filename}` : ''}_mcp_${tool.provider === 'codex' ? 'Codex' : tool.provider==='claude' ? 'Claude' : 'Bridge'}`}
          args=""
          output={tool.state === 'failed'
            ? 'Error: tool call failed: La operación no se completó.'
            : tool.state === 'cancelled' ? 'Operación cancelada.' : tool.state === 'completed' ? 'Operación completada.' : ''}
          initialProgress={['started','cancelled'].includes(tool.state) ? 0.1 : 1}
          isSubmitting={isSubmitting && tool.state === 'started'}
          isLast={isLast}
        />
        </div>
      ))}
      {text && <Reasoning reasoning={text} isLast={isLast} />}
    </>
  );
});
export default BridgeToolReasoning;
