import { getBridgeCapabilities, isBridgeModel } from './bridgeModels';

/**
 * Los alias Bridge se definen solo en bridgeModels.ts. Servidor, cliente y parámetros derivan de ahí,
 * y upstream razona por el nombre del modelo en varios sitios («claude» en el nombre, etc.), así que
 * esta lista es lo que impide que un alias Bridge se trate como el modelo de un proveedor real.
 */
describe('Roko hook: lista única de modelos Bridge', () => {
  it.each(['gpt-codex', 'gpt-codex-fast', 'gpt-codex-deep'])('%s es un modelo Codex', (model) => {
    expect(getBridgeCapabilities(model)?.provider).toBe('codex');
    expect(isBridgeModel(model)).toBe(true);
  });

  it.each(['claude-max', 'claude-max-fast', 'claude-max-deep'])(
    '%s es un modelo Claude',
    (model) => {
      expect(getBridgeCapabilities(model)?.provider).toBe('claude');
      expect(isBridgeModel(model)).toBe(true);
    },
  );

  it.each([
    'gpt-4o',
    'claude-sonnet-4-6',
    'anthropic/claude-max',
    'my-claude-max',
    'claude-max-turbo',
    'gpt-codex-slow',
    'Claude-Max',
    '',
    null,
    undefined,
  ])('%p no es un modelo Bridge', (model) => {
    expect(getBridgeCapabilities(model)).toBeUndefined();
    expect(isBridgeModel(model)).toBe(false);
  });

  it('describe lo que cada CLI sabe hacer: Claude no tiene verbosity ni resumen, Codex sí', () => {
    const codex = getBridgeCapabilities('gpt-codex');
    const claude = getBridgeCapabilities('claude-max');
    expect(codex).toMatchObject({ supportsVerbosity: true, supportsSummary: true });
    expect(claude).toMatchObject({ supportsVerbosity: false, supportsSummary: false });
    expect(codex?.efforts).toContain('ultra');
    expect(claude?.efforts).not.toContain('ultra');
  });

  it('isBridgeModel y getBridgeCapabilities nunca discrepan', () => {
    for (const model of ['gpt-codex', 'claude-max-fast', 'gpt-4o', 'claude-3-opus', '']) {
      expect(isBridgeModel(model)).toBe(getBridgeCapabilities(model) !== undefined);
    }
  });
});
