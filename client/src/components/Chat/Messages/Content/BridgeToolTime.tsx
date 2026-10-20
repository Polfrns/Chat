import { useEffect, useRef, useState } from 'react';
import type { BridgeToolEvent } from './bridgeToolRecords';
import { formatActivitySeconds } from './activityTime';

export default function BridgeToolTime({ tool, running }: { tool: BridgeToolEvent; running: boolean }) {
  const start = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed(performance.now() - start.current), 200);
    return () => window.clearInterval(timer);
  }, [running]);
  const duration = running ? elapsed : tool.durationMs;
  if (duration === undefined && (tool.attempt ?? 0) <= 1 && tool.state !== 'cancelled') return null;
  return (
    <div className="text-xs text-text-secondary" role="status">
      {tool.state === 'cancelled' ? 'Cancelada · ' : ''}
      {tool.attempt && tool.attempt > 1 ? `Reintento ${tool.attempt - 1} · ` : ''}
      {duration !== undefined && (
        <span title={running || tool.timingSource === 'observed' || !tool.timingSource
          ? 'Tiempo observado desde la recepción del evento; puede diferir de la ejecución real por el transporte del SDK.'
          : 'Duración medida de esta operación; no incluye el tiempo de generación del modelo.'}>
          {running ? 'En curso · ' : tool.timingSource === 'observed' || !tool.timingSource ? 'Tiempo observado · ' : 'Ejecución · '}
          {formatActivitySeconds(duration)}
        </span>
      )}
    </div>
  );
}
