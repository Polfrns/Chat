import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OBSERVABILITY_PATCH_MARKER,
  assertObservabilityPatch,
  findUnpatchedFiles,
  isTraceExportConfigured,
  resolveAgentsDistDir,
} from './observabilityPatch';

const FILES = ['langfuse', 'langfuseToolOutputTracing', 'run'];

/** Builds a fake `dist` tree; `skip` leaves one file without the marker. */
function fakeDist(skip?: string): string {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'roko-agents-dist-'));
  for (const [dir, ext] of [
    ['cjs', 'cjs'],
    ['esm', 'mjs'],
  ]) {
    fs.mkdirSync(path.join(dist, dir));
    for (const name of FILES) {
      const file = path.join(dist, dir, `${name}.${ext}`);
      const marker = skip === `${dir}/${name}` ? '' : `// ${OBSERVABILITY_PATCH_MARKER}\n`;
      fs.writeFileSync(file, `${marker}module.exports = {};\n`);
    }
  }
  return dist;
}

/**
 * La privacidad de las trazas (contenido enmascarado, sesiones seudónimas) depende de un parche sobre
 * `@librechat/agents`. Si una instalación limpia lo pierde, las trazas saldrían sin filtrar y nada lo
 * avisaría: el arranque tiene que fallar en ese caso.
 */
describe('Roko hook: parche de observabilidad', () => {
  const exporting = { OTEL_TRACING_ENABLED: 'true' } as NodeJS.ProcessEnv;
  const quiet = {} as NodeJS.ProcessEnv;

  it('el paquete instalado lleva el parche en los tres ficheros, en CJS y ESM', () => {
    expect(findUnpatchedFiles(resolveAgentsDistDir())).toEqual([]);
  });

  it('detecta un fichero sin parchear', () => {
    const missing = findUnpatchedFiles(fakeDist('esm/run'));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('run.mjs');
  });

  it('un fichero que falta cuenta como sin parchear', () => {
    const dist = fakeDist();
    fs.rmSync(path.join(dist, 'cjs', 'langfuse.cjs'));
    expect(findUnpatchedFiles(dist)).toHaveLength(1);
  });

  it('falla el arranque si se exportan trazas sin el parche', () => {
    expect(() =>
      assertObservabilityPatch({ env: exporting, agentsDistDir: fakeDist('cjs/langfuse') }),
    ).toThrow(/observability:patch/);
  });

  it('falla también con Langfuse configurado', () => {
    const env = { LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' } as NodeJS.ProcessEnv;
    expect(() => assertObservabilityPatch({ env, agentsDistDir: fakeDist('cjs/run') })).toThrow();
  });

  it('sin exportación de trazas no falla, pero devuelve lo que falta para registrarlo', () => {
    const missing = assertObservabilityPatch({ env: quiet, agentsDistDir: fakeDist('cjs/run') });
    expect(missing).toHaveLength(1);
  });

  it('con el parche completo no devuelve nada', () => {
    expect(assertObservabilityPatch({ env: exporting, agentsDistDir: fakeDist() })).toEqual([]);
  });

  describe('cuándo hay exportación de trazas', () => {
    it.each([
      [{ OTEL_TRACING_ENABLED: 'true' }, true],
      [{ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' }, true],
      [{ LANGFUSE_PUBLIC_KEY: 'pk' }, false],
      [
        { LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_TRACING_ENABLED: 'false' },
        false,
      ],
      [{ OTEL_TRACING_ENABLED: 'true', OTEL_SDK_DISABLED: 'true' }, false],
      [{}, false],
    ])('%j → %s', (env, expected) => {
      expect(isTraceExportConfigured(env as NodeJS.ProcessEnv)).toBe(expected);
    });
  });
});
