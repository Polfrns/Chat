import { TextDecoder } from 'node:util';
Object.assign(globalThis, {TextDecoder});
import React from 'react';
import { render, screen } from '@testing-library/react';
import BridgeToolReasoning from '../BridgeToolReasoning';

jest.mock('../ToolCall', () => ({
  __esModule: true,
  default: ({name, output, initialProgress}: {name: string; output: string; initialProgress: number}) => (
    <div data-testid="mcp-tool-card" data-name={name} data-output={output} data-progress={initialProgress} />
  ),
}));
jest.mock('../Parts', () => ({
  Reasoning: ({reasoning}: {reasoning: string}) => <span data-testid="normal-reasoning">{reasoning}</span>,
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
