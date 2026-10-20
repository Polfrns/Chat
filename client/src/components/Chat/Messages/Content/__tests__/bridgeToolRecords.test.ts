import { TextDecoder } from 'node:util';
Object.assign(globalThis, {TextDecoder});
import { parseBridgeToolRecords } from '../bridgeToolRecords';
const encode = (obj: object) => `[[ROKO_BRIDGE_TOOL_V1:${Buffer.from(JSON.stringify(obj)).toString('base64url')}]]\n`;
const id = 'ABCDEFGHabcdefgh123456789';

test('preserves commentary/tool order and updates a tool in place', () => {
  const started = { v: 1, provider: 'codex', type: 'command_execution', id, state: 'started' };
  const result = parseBridgeToolRecords(
    'Preparing the document.\n' + encode(started) + 'Validating the result.\n' +
    encode({ ...started, state: 'completed' }) + 'Ready.',
  );
  expect(result.entries.map((entry) => entry.kind)).toEqual(['text', 'tool', 'text', 'text']);
  expect(result.entries[1]).toMatchObject({ kind: 'tool', tool: { state: 'completed' } });
  expect(result.tools).toHaveLength(1);
});

describe('Bridge tool cards', () => {
  test('progress updates collapse into a single MCP-style card', () => {
    const started = {v: 1, provider: 'codex', type: 'command_execution', id, state: 'started'};
    const data = encode(started) + encode({...started, state: 'completed'});
    const result = parseBridgeToolRecords(data);
    expect(result.text).toBe('');
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({label:'Comando del workspace', state:'completed'});
  });
  test('preserves genuine reasoning alongside tool metadata', () => {
    const data = 'Resumen público.\n' + encode({v:1, provider:'claude', type:'Read', id, state:'started'});
    const result = parseBridgeToolRecords(data);
    expect(result.text).toBe('Resumen público.');
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].label).toBe('Lectura de archivo');
  });
  test('does not display forged tool names, raw output or incomplete records', () => {
    const data = encode({v:1, provider:'claude', type:'DangerousTool', id, state:'completed'}) +
      '[[ROKO_BRIDGE_TOOL_V1:eyJhb';
    const result = parseBridgeToolRecords(data);
    expect(result.tools).toHaveLength(0);
    expect(result.text).not.toContain('ROKO_BRIDGE_TOOL');
  });
});

test('extended V1 operation, duration and cancellation are safe and cannot regress',()=>{
  const started={v:1,provider:'codex',type:'command_execution',operation:'code.execute.python',id,state:'started',attempt:2};
  const result=parseBridgeToolRecords(encode(started)+encode({...started,state:'cancelled',durationMs:800})+encode(started));
  expect(result.tools).toHaveLength(1);
  expect(result.tools[0]).toMatchObject({label:'Ejecutar Python',state:'cancelled',durationMs:800,attempt:2});
});
test('Bridge generated files and real MCP names render without accepting arbitrary labels or paths',()=>{
  const result=parseBridgeToolRecords(encode({v:1,provider:'bridge',type:'file.generated.pdf',operation:'file.generated.pdf',id,state:'completed',filename:'/secret/path.pdf',label:'SECRET_COMMAND'}));
  expect(result.tools[0]).toMatchObject({label:'PDF generado',state:'completed'});
  expect(result.tools[0].filename).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('SECRET_COMMAND');
});
