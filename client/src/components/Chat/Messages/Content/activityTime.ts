export function formatActivitySeconds(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 100) return '<0,1 s';
  return `${(Math.max(0, milliseconds) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`;
}
