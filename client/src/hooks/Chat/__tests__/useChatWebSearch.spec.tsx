import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import useChatWebSearch from '../useChatWebSearch';
import { ephemeralAgentByConvoId } from '~/store';

let mockConversation: Record<string, unknown> | null = null;
let mockEndpoints: Record<string, unknown> | undefined;
const mockSetOptionValue = jest.fn();
const mockSetOption = jest.fn(() => mockSetOptionValue);

jest.mock('~/Providers/ChatContext', () => ({
  useChatContext: () => ({ conversation: mockConversation }),
}));
jest.mock('~/hooks/Conversations/useSetIndexOptions', () => ({
  __esModule: true,
  default: () => ({ setOption: mockSetOption }),
}));
jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpoints }),
}));

const CONVERSATION_ID = 'convo-1';

/** El hook y el estado del agente efímero, para ver dónde acaba cada interruptor. */
function renderSearch() {
  return renderHook(
    () => ({
      search: useChatWebSearch(),
      ephemeralAgent: useRecoilValue(ephemeralAgentByConvoId(CONVERSATION_ID)),
    }),
    { wrapper: ({ children }) => <RecoilRoot>{children}</RecoilRoot> },
  );
}

/**
 * En los modelos Bridge la búsqueda web es una opción del modelo (la ejecuta el CLI); en el resto es
 * una herramienta de LibreChat sobre el agente efímero. Si upstream cambia el interruptor de la barra
 * y este camino se pierde, el interruptor de un modelo Bridge dejaría de hacer nada.
 */
describe('Roko hook: búsqueda web de los modelos Bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpoints = undefined;
    mockConversation = {
      conversationId: CONVERSATION_ID,
      endpoint: 'Claude Max',
      model: 'claude-max',
    };
  });

  it('en un modelo Bridge se activa como opción del modelo y no toca el agente efímero', () => {
    const { result } = renderSearch();

    expect(result.current.search.bridge?.provider).toBe('claude');
    act(() => result.current.search.setEnabled(true));

    expect(mockSetOption).toHaveBeenCalledWith('web_search');
    expect(mockSetOptionValue).toHaveBeenCalledWith(true);
    expect(result.current.ephemeralAgent?.web_search).toBeUndefined();
  });

  it('en un modelo Bridge «activa» lo que dice la conversación, no el agente efímero', () => {
    mockConversation = { ...mockConversation, web_search: true };
    const { result } = renderSearch();

    expect(result.current.search.enabled).toBe(true);
    expect(result.current.search.available).toBe(true);
  });

  it('un modelo Bridge cuenta como endpoint propio aunque la configuración no diga «custom»', () => {
    const { result } = renderSearch();

    expect(result.current.search.isCustom).toBe(true);
  });

  it('en un modelo normal se activa como herramienta del agente efímero y no toca el modelo', () => {
    mockConversation = {
      conversationId: CONVERSATION_ID,
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4o',
    };
    const { result } = renderSearch();

    expect(result.current.search.bridge).toBeUndefined();
    expect(result.current.search.isCustom).toBe(false);
    act(() => result.current.search.setEnabled(true));

    expect(result.current.ephemeralAgent?.web_search).toBe(true);
    expect(result.current.search.enabled).toBe(true);
    expect(mockSetOption).not.toHaveBeenCalled();
  });

  it('un endpoint personalizado que no es Bridge sigue siendo «custom» pero sin opción de modelo', () => {
    mockEndpoints = { Gateway: { type: EModelEndpoint.custom } };
    mockConversation = { conversationId: CONVERSATION_ID, endpoint: 'Gateway', model: 'llama-3' };
    const { result } = renderSearch();

    expect(result.current.search.bridge).toBeUndefined();
    expect(result.current.search.isCustom).toBe(true);
  });

  it('sin id de conversación usa la conversación nueva', () => {
    mockConversation = { endpoint: EModelEndpoint.openAI, model: 'gpt-4o' };
    const { result } = renderHook(
      () => ({
        search: useChatWebSearch(),
        fresh: useRecoilValue(ephemeralAgentByConvoId(Constants.NEW_CONVO)),
      }),
      { wrapper: ({ children }) => <RecoilRoot>{children}</RecoilRoot> },
    );

    act(() => result.current.search.setEnabled(true));

    expect(result.current.fresh?.web_search).toBe(true);
  });
});
