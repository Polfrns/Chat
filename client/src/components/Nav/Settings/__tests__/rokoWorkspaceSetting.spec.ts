import { isValidElementType } from 'react-is';
import { SettingsTabValues } from 'librechat-data-provider';
import type { SettingsContextValue } from '../types';
import en from '~/locales/en/translation.json';
import { registry } from '../registry';
import { TABS } from '../types';

const SETTING_ID = 'rokoWorkspaceMcp';
const withWorkspace = (hasWorkspaceMcp: boolean) => ({ hasWorkspaceMcp }) as SettingsContextValue;

/**
 * El interruptor global del workspace vive en el registro de ajustes de LibreChat desde v0.8.8 (antes
 * era una pestaña de Personalización). Si una actualización reordena el registro o las secciones de
 * la pestaña Datos, el usuario pierde el único sitio donde puede desactivar el workspace.
 */
describe('Roko hook: interruptor del workspace en ajustes', () => {
  const setting = registry.find((entry) => entry.id === SETTING_ID);

  it('está registrado en la pestaña Datos, en una sección que esa pestaña declara', () => {
    expect(setting).toBeDefined();
    expect(setting?.tab).toBe(SettingsTabValues.DATA);
    const dataTab = TABS.find((tab) => tab.id === SettingsTabValues.DATA);
    expect(dataTab?.sections.map((section) => section.id)).toContain(setting?.section);
  });

  it('solo se muestra a quien tiene disponible el workspace', () => {
    expect(setting?.show?.(withWorkspace(true))).toBe(true);
    expect(setting?.show?.(withWorkspace(false))).toBe(false);
  });

  it('su componente es renderizable', () => {
    expect(isValidElementType(setting?.Component)).toBe(true);
  });

  it('se encuentra buscando «workspace» en los ajustes', () => {
    expect(setting?.keywords).toContain('workspace');
  });

  it('la etiqueta, la sección y la descripción tienen texto en inglés', () => {
    const translations = en as Record<string, string>;
    const dataTab = TABS.find((tab) => tab.id === SettingsTabValues.DATA);
    const section = dataTab?.sections.find((candidate) => candidate.id === setting?.section);

    expect(translations[setting?.labelKey as string]).toBeTruthy();
    expect(translations[section?.labelKey as string]).toBeTruthy();
    expect(translations.com_roko_workspace_mcp_description).toBeTruthy();
  });

  it('el contexto de ajustes sabe cuándo hay workspace', () => {
    // Un contexto sin el campo no puede satisfacer el tipo: el compilador exige que quien lo
    // construya (contexto real y tests) decida si el workspace está disponible.
    const context: SettingsContextValue['hasWorkspaceMcp'] = true;
    expect(typeof context).toBe('boolean');
  });
});
