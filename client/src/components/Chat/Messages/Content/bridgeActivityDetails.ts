import descriptions from './bridgeActivityDescriptions.json';
import type { BridgeToolEvent } from './bridgeToolRecords';

export type BridgeActivityDetailCode = keyof typeof descriptions;

export function bridgeActivityDetailCode(value: unknown): BridgeActivityDetailCode | undefined {
  return typeof value === 'string' && Object.hasOwn(descriptions, value)
    ? value as BridgeActivityDetailCode : undefined;
}

export function bridgeActivityDescription(code?: BridgeActivityDetailCode) {
  return code ? descriptions[code] : undefined;
}

const ERRORS: Record<string, string> = {
  path_length: 'La ruta del archivo supera el límite admitido por el entorno.',
  windows_sandbox_setup: 'No se pudo inicializar el entorno de ejecución aislado.',
  permission_denied: 'El entorno denegó los permisos necesarios para esta operación.',
  missing_path_or_executable: 'No se encontró un archivo o ejecutable necesario.',
  command_failed: 'El ejecutor devolvió un error al ejecutar el comando.',
  patch_failed: 'No se pudo aplicar la modificación al archivo.',
  tool_failed: 'La herramienta informó de un error.',
  operation_failed: 'La operación no pudo completarse.',
  timeout: 'Se agotó el tiempo disponible para esta ejecución.',
};

export function bridgeActivityErrorCategory(value: unknown): string | undefined {
  return typeof value === 'string' && Object.hasOwn(ERRORS, value) ? value : undefined;
}

export function bridgeActivityOutput(tool: BridgeToolEvent): string {
  const description = bridgeActivityDescription(tool.detailCode);
  const validationResult = tool.validationStatus === 'unavailable'
    ? 'No se pudo comprobar el formato: el toolkit de archivos no está disponible en este entorno.'
    : tool.validationStatus === 'partial'
      ? 'Solo se pudo comprobar el formato de parte de los archivos; no todos están validados.'
      : tool.validationStatus === 'checked'
        ? 'Los archivos superaron las comprobaciones disponibles. Esto no comprueba la exactitud de su contenido.'
        : undefined;
  const result = tool.state === 'failed'
    ? `Error: tool call failed: ${ERRORS[tool.errorCategory ?? ''] ?? 'La operación no se completó.'}`
    : tool.state === 'cancelled' ? tool.errorCategory === 'timeout'
      ? 'Operación cancelada al superar el límite de tiempo.' : 'Operación cancelada.'
      : tool.state === 'completed' ? validationResult ?? description?.success ?? 'Operación completada.'
        : 'Operación en curso.';
  const summary = tool.summary ?? tool.description ?? description?.purpose;
  if (tool.state === 'failed') return [result, summary].filter(Boolean).join('\n\n');
  if (tool.state === 'cancelled') return [summary, result].filter(Boolean).join('\n\n');
  if (tool.state === 'completed' && validationResult) return [summary, validationResult].filter(Boolean).join('\n\n');
  return summary ?? (tool.state === 'started' ? '' : result);
}
