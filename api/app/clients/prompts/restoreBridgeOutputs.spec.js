const { restoreBridgeOutputs, shouldRestoreBridgeOutputs } = require('./restoreBridgeOutputs');

const output = (fileId, index = 0) => ({ file_id: fileId, toolCallId: `bridge-output-${index}` });
const assistant = (...attachments) => ({ isCreatedByUser: false, attachments });
const human = () => ({ isCreatedByUser: true });
const stored = (fileId) => ({ file_id: fileId, filepath: `/uploads/${fileId}.docx` });
const bridgeOptions = (overrides = {}) => ({
  model: 'gpt-codex',
  req: { user: { id: 'user-1' }, body: {} },
  ...overrides,
});
const getFilesFrom = (...files) => jest.fn(async () => files);

/**
 * Un modelo Bridge sigue editando la última versión que generó, no el original que se subió.
 * Si falla, el usuario edita sin saberlo una versión vieja.
 */
describe('Roko hook: seguir editando la última salida de Bridge', () => {
  describe('cuándo aplica', () => {
    it('para un modelo Bridge, sin archivos nuevos en la petición', () => {
      expect(shouldRestoreBridgeOutputs(bridgeOptions())).toBe(true);
    });

    it('no para modelos que no son Bridge', () => {
      expect(shouldRestoreBridgeOutputs(bridgeOptions({ model: 'gpt-4o' }))).toBe(false);
    });

    it('el modelo del agente manda sobre el de la petición', () => {
      const options = bridgeOptions({
        model: 'gpt-4o',
        agent: { model_parameters: { model: 'claude-max' } },
      });
      expect(shouldRestoreBridgeOutputs(options)).toBe(true);
    });

    it('no cuando el usuario desactiva reenviar archivos', () => {
      expect(shouldRestoreBridgeOutputs(bridgeOptions({ resendFiles: false }))).toBe(false);
    });

    it('no cuando la petición adjunta archivos nuevos: empiezan una base de edición nueva', () => {
      const options = bridgeOptions({ req: { user: { id: 'user-1' }, body: { files: [{}] } } });
      expect(shouldRestoreBridgeOutputs(options)).toBe(false);
    });
  });

  describe('qué devuelve', () => {
    it('los archivos de la última respuesta que generó salidas, ignorando las que no', async () => {
      const getFiles = getFilesFrom(stored('f-new'));
      const messages = [
        assistant(output('f-old')),
        human(),
        assistant(output('f-new')),
        human(),
        assistant(),
        human(),
      ];

      const restored = await restoreBridgeOutputs({ messages, options: bridgeOptions(), getFiles });

      expect(restored).toEqual([stored('f-new')]);
      expect(getFiles).toHaveBeenCalledWith(
        { file_id: { $in: ['f-new'] }, user: 'user-1' },
        {},
        {},
      );
    });

    it('conserva el orden y no duplica los ids de una misma respuesta', async () => {
      const getFiles = getFilesFrom(stored('b'), stored('a'));
      const messages = [assistant(output('a', 0), output('b', 1), output('a', 2)), human()];

      const restored = await restoreBridgeOutputs({ messages, options: bridgeOptions(), getFiles });

      expect(restored.map((file) => file.file_id)).toEqual(['a', 'b']);
      expect(getFiles.mock.calls[0][0].file_id.$in).toEqual(['a', 'b']);
    });

    it('un adjunto normal de herramienta no se confunde con una salida de Bridge', async () => {
      const getFiles = getFilesFrom();
      const messages = [assistant({ file_id: 'chart', toolCallId: 'call_1' }), human()];

      const restored = await restoreBridgeOutputs({ messages, options: bridgeOptions(), getFiles });

      expect(restored).toBeNull();
      expect(getFiles).not.toHaveBeenCalled();
    });

    it('limita la búsqueda al tenant del usuario cuando lo tiene', async () => {
      const getFiles = getFilesFrom(stored('f1'));
      const options = bridgeOptions({ req: { user: { id: 'user-1', tenantId: 't-a' }, body: {} } });

      await restoreBridgeOutputs({
        messages: [assistant(output('f1')), human()],
        options,
        getFiles,
      });

      expect(getFiles).toHaveBeenCalledWith(
        { file_id: { $in: ['f1'] }, user: 'user-1', tenantId: 't-a' },
        {},
        {},
      );
    });

    it('no consulta nada fuera de Bridge ni sin usuario', async () => {
      const getFiles = getFilesFrom();
      const messages = [assistant(output('f1')), human()];

      const other = await restoreBridgeOutputs({
        messages,
        options: bridgeOptions({ model: 'gpt-4o' }),
        getFiles,
      });
      const anonymous = await restoreBridgeOutputs({
        messages,
        options: bridgeOptions({ req: { user: {}, body: {} } }),
        getFiles,
      });

      expect(other).toBeNull();
      expect(anonymous).toBeNull();
      expect(getFiles).not.toHaveBeenCalled();
    });
  });

  it('falla en alto si la última versión editada ya no está, sin volver al original', async () => {
    const getFiles = jest.fn(async () => [{ file_id: 'f1' }]);

    await expect(
      restoreBridgeOutputs({
        messages: [assistant(output('f1')), human()],
        options: bridgeOptions(),
        getFiles,
      }),
    ).rejects.toThrow(/no longer available/);
  });
});
