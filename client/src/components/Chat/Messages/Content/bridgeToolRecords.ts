/** Display-only progress records emitted by our authenticated Codex/Claude bridge.
 *  Never use these events as executable tool calls or model instructions. */
export type BridgeToolEvent = {
  id: string;
  provider: 'codex' | 'claude' | 'bridge';
  type: string;
  state: 'started' | 'completed' | 'failed' | 'cancelled';
  operation?: string;
  durationMs?: number;
  attempt?: number;
  filename?: string;
  label: string;
};

const LABELS: Record<string, Record<string, string>> = {
  codex: {
    command_execution: 'Comando del workspace', file_change: 'Modificación de archivos',
    mcp_tool_call: 'Herramienta MCP interna', web_search: 'Búsqueda web',
    image_generation: 'Generación de imagen', collab_tool_call: 'Operación de agente',
    todo_list: 'Plan de trabajo', exec_command: 'Comando del workspace',
  },
  claude: {
    Read: 'Lectura de archivo', Write: 'Escritura de archivo', Edit: 'Edición de archivo',
    Glob: 'Búsqueda de archivos', Grep: 'Búsqueda de texto', WebSearch: 'Búsqueda web',
    WebFetch: 'Consulta web', Bash: 'Comando del workspace',
    mcp__workspace__execute: 'Comando del workspace',
  },
};
const OPERATIONS: Record<string,string> = {
  "workspace.list": "Listar archivos",
  "workspace.read": "Leer archivo",
  "workspace.write": "Crear archivo",
  "workspace.edit": "Editar archivo",
  "workspace.delete": "Eliminar archivo",
  "workspace.search": "Buscar en archivos",
  "workspace.mkdir": "Crear carpeta",
  "workspace.validate": "Validar archivo",
  "file.upload": "Preparar adjunto",
  "file.download": "Recoger archivos",
  "file.generated.python": "Archivo Python generado",
  "file.generated.docx": "Documento Word generado",
  "file.generated.pdf": "PDF generado",
  "file.generated.xlsx": "Hoja de cálculo generada",
  "file.generated.image": "Imagen generada",
  "file.generated.other": "Archivo generado",
  "code.execute.python": "Ejecutar Python",
  "code.execute.javascript": "Ejecutar JavaScript",
  "command_execution": "Comando del workspace",
  "command.execute": "Ejecutar comando",
  "code.test": "Ejecutar pruebas",
  "code.validate": "Validar código",
  "web.search": "Búsqueda web",
  "web.fetch": "Consultar web",
  "web.open": "Abrir web",
  "web.download": "Descargar de web",
  "file_change": "Modificación de archivos",
  "mcp_tool_call": "Herramienta MCP interna",
  "todo_list": "Plan de trabajo",
  "collab_tool_call": "Operación de agente",
  "image_generation": "Generación de imagen"
};
const RECORD = /\[\[ROKO_BRIDGE_TOOL_V1:([A-Za-z0-9_-]{8,1800})\]\]\r?\n?/g;
const UNFINISHED = /\[\[ROKO_BRIDGE_TOOL_V1:[A-Za-z0-9_-]*$/;
const MARKER = '[[ROKO_BRIDGE_TOOL_V1:';
function hidePartialMarker(value: string) {
  const stripped = value.replace(UNFINISHED, '');
  for (let length = MARKER.length - 1; length > 0; length--) {
    if (stripped.endsWith(MARKER.slice(0, length))) return stripped.slice(0, -length);
  }
  return stripped;
}
const MAX_RECORDS = 1000;

export function parseBridgeToolRecords(reasoning: string): { text: string; tools: BridgeToolEvent[] } {
  const tools = new Map<string, BridgeToolEvent>();
  const text = reasoning.replace(RECORD, (_match, data: string) => {
    try {
      const bytes = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const event = JSON.parse(new TextDecoder().decode(bytes));
      if (event?.v !== 1 || !['codex','claude','bridge'].includes(event.provider) ||
          !['started', 'completed', 'failed', 'cancelled'].includes(event.state) ||
          typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(event.id) ||
          typeof event.type !== 'string' || !(Object.hasOwn(LABELS[event.provider] ?? {}, event.type) || Object.hasOwn(OPERATIONS,event.type) || /^mcp__[A-Za-z0-9_]+__[A-Za-z0-9_.-]+$/.test(event.type))) {
        return ''; // Unknown/malformed internal records are never displayed as private data.
      }
      const key = `${event.provider}:${event.id}`;
      const operation = typeof event.operation==='string' && (Object.hasOwn(OPERATIONS,event.operation) || /^mcp\.[A-Za-z0-9_.-]{1,100}$/.test(event.operation) || /^mcp__[A-Za-z0-9_]+__[A-Za-z0-9_.-]+$/.test(event.operation)) ? event.operation:undefined;
      const previous=tools.get(key);
      if (previous && previous.state !== 'started') return '';
      const durationMs=Number.isFinite(event.durationMs) && event.durationMs>=0 && event.durationMs<86400000 ? event.durationMs:undefined;
      const attempt=Number.isSafeInteger(event.attempt) && event.attempt>0 && event.attempt<100 ? event.attempt:undefined;
      const filename=typeof event.filename==='string' && /^[\p{L}\p{N} ._-]{1,100}$/u.test(event.filename) ? event.filename:undefined;
      if (tools.has(key) || tools.size < MAX_RECORDS) {
        tools.set(key, { id: key, provider: event.provider, type: event.type,
          state: event.state, operation, durationMs, attempt, filename, label: (operation ? OPERATIONS[operation] ?? operation : LABELS[event.provider]?.[event.type] ?? OPERATIONS[event.type] ?? event.type) });
      }
    } catch { /* Partial/malformed wire record: discard, do not render its contents. */ }
    return '';
  });
  return { text: hidePartialMarker(text).trim(), tools: [...tools.values()] };
}
