import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { formatActivitySeconds } from './activityTime';

const GenerationElapsedContext = createContext<number | undefined>(undefined);

export function useResponseGenerationElapsed() {
  return useContext(GenerationElapsedContext);
}

export function ResponseGenerationTimer({ running, children }: { running: boolean; children: ReactNode }) {
  const start = useRef<number | undefined>(undefined);
  const [elapsed, setElapsed] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!running) {
      if (start.current !== undefined) {
        setElapsed(performance.now() - start.current);
        start.current = undefined;
      }
      return;
    }
    start.current = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      if (start.current !== undefined) setElapsed(performance.now() - start.current);
    }, 200);
    return () => window.clearInterval(timer);
  }, [running]);
  return <GenerationElapsedContext.Provider value={elapsed}>{children}</GenerationElapsedContext.Provider>;
}

export function ResponseGenerationTime() {
  const elapsed = useResponseGenerationElapsed();
  if (elapsed === undefined) return null;
  return (
    <span className="tabular-nums" title="Tiempo total de generación de esta respuesta">
      · {formatActivitySeconds(elapsed)}
    </span>
  );
}
