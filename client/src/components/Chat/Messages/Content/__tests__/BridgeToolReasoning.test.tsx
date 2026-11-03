import { TextDecoder } from 'node:util';
Object.assign(globalThis, {TextDecoder});
import React from 'react';
import { render, screen } from '@testing-library/react';
import BridgeToolReasoning from '../BridgeToolReasoning';
import { reasoningBlockKey } from '../disclosure';

jest.mock('../ToolCall', () => ({
  __esModule: true,
  default: ({name, output, initialProgress}: {name: string; output: string; initialProgress: number}) => (
    <div data-testid="mcp-tool-card" data-name={name} data-output={output} data-progress={initialProgress} />
  ),
}));
jest.mock('../Parts', () => ({
  Reasoning: ({reasoning, disclosureKey}: {reasoning: string; disclosureKey?: number | string}) => (
    <span data-testid="normal-reasoning" data-disclosure-key={String(disclosureKey)}>{reasoning}</span>
  ),
}));

const id = 'ABCDEFGHabcdefgh123456789';
const record = (state: string) => `[[ROKO_BRIDGE_TOOL_V1:${Buffer.from(JSON.stringify({
  v: 1, provider: 'codex', type: 'command_execution', state, id,
})).toString('base64url')}]]\n`;

describe('read-only Bridge tool cards', () => {
  it('renders the same ToolCall component as native MCP tools and updates progress', () => {
    const {rerender} = render(<BridgeToolReasoning reasoning={record('started')} isLast isSubmitting />);
    expect(screen.getAllByTestId('mcp-tool-card')).toHaveLength(1);
    expect(screen.getByTestId('mcp-tool-card').getAttribute('data-name'))
      .toBe('Comando del workspace_mcp_Codex');
    expect(screen.getByTestId('mcp-tool-card').getAttribute('data-progress')).toBe('0.1');
    rerender(<BridgeToolReasoning reasoning={record('started') + record('completed')} isLast isSubmitting />);
    expect(screen.getAllByTestId('mcp-tool-card')).toHaveLength(1);
    expect(screen.getByTestId('mcp-tool-card').getAttribute('data-progress')).toBe('1');
    expect(screen.getByTestId('mcp-tool-card').getAttribute('data-output')).toBe('Operación completada.');
  });
  it('does not show the wire marker or expose tool inputs', () => {
    render(<BridgeToolReasoning reasoning={'Resumen público.\n' + record('failed')} isLast isSubmitting={false} />);
    expect(screen.getByTestId('normal-reasoning')).toHaveTextContent('Resumen público.');
    expect(screen.queryByText(/ROKO_BRIDGE_TOOL/)).not.toBeInTheDocument();
    expect(screen.getByTestId('mcp-tool-card').getAttribute('data-output')).toMatch(/tool call failed/);
  });
});

it('renders cancellation and retry timing while preserving display-only ToolCall cards',()=>{
  const encoded=`[[ROKO_BRIDGE_TOOL_V1:${Buffer.from(JSON.stringify({v:1,provider:'codex',type:'command_execution',operation:'code.execute.python',id,state:'cancelled',durationMs:800,attempt:2})).toString('base64url')}]]\n`;
  render(<BridgeToolReasoning reasoning={encoded} isLast isSubmitting={false} />);
  expect(screen.getByRole('status')).toHaveTextContent('Cancelada');
  expect(screen.getByRole('status')).toHaveTextContent('Reintento 1');
  expect(screen.getByRole('status')).toHaveTextContent('0,8 s');
  expect(screen.getByTestId('mcp-tool-card').getAttribute('data-progress')).toBe('0.1');
});

describe('disclosure keys for Bridge progress blocks', () => {
  it('keeps the part index for the first block and gives later blocks their own key', () => {
    expect(reasoningBlockKey(3, 0)).toBe(3);
    expect(reasoningBlockKey(3, 2)).toBe('3:2');
    expect(reasoningBlockKey(32, 0)).not.toBe(reasoningBlockKey(3, 2));
  });

  it('assigns each text block between tool cards a distinct disclosure', () => {
    const otherId = 'ZYXWVUTSzyxwvuts987654321';
    const otherRecord = `[[ROKO_BRIDGE_TOOL_V1:${Buffer.from(JSON.stringify({
      v: 1, provider: 'codex', type: 'command_execution', state: 'completed', id: otherId,
    })).toString('base64url')}]]\n`;
    render(
      <BridgeToolReasoning
        partKeyIndex={4}
        reasoning={'Primero.\n' + record('completed') + 'Después.\n' + otherRecord}
        isLast
        isSubmitting={false}
      />,
    );
    const keys = screen.getAllByTestId('normal-reasoning').map((el) => el.getAttribute('data-disclosure-key'));
    expect(keys[0]).toBe('4');
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => !key?.includes('.'))).toBe(true);
  });
});
