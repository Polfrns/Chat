import { NEXTCLOUD_TOOL_NAME, SKILL_LIBRARY_TOOL_NAME } from 'librechat-data-provider';
import { addRokoAgentTools } from './agentTools';

const both = { nextcloudConfigured: true, skillLibraryEnabled: true };
const none = { nextcloudConfigured: false, skillLibraryEnabled: false };

/**
 * Nextcloud y la biblioteca de skills no son herramientas que el usuario elija en el agente: Roko las
 * añade a cada petición. Si el punto donde se añaden desaparece en una actualización, el modelo deja
 * de tenerlas sin ningún error.
 */
describe('Roko hook: herramientas inyectadas en el agente', () => {
  it('añade Nextcloud y la biblioteca de skills a un agente sin herramientas', () => {
    expect(addRokoAgentTools(undefined, both)).toEqual([NEXTCLOUD_TOOL_NAME, SKILL_LIBRARY_TOOL_NAME]);
  });

  it('conserva las herramientas que el agente ya tenía, en su orden, y añade las nuevas detrás', () => {
    expect(addRokoAgentTools(['web_search', 'execute_code'], both)).toEqual([
      'web_search',
      'execute_code',
      NEXTCLOUD_TOOL_NAME,
      SKILL_LIBRARY_TOOL_NAME,
    ]);
  });

  it('no duplica una herramienta que el agente ya tiene', () => {
    expect(addRokoAgentTools([SKILL_LIBRARY_TOOL_NAME, 'web_search'], both)).toEqual([
      SKILL_LIBRARY_TOOL_NAME,
      'web_search',
      NEXTCLOUD_TOOL_NAME,
    ]);
  });

  it('Nextcloud solo se añade si el despliegue lo tiene configurado', () => {
    const tools = addRokoAgentTools([], { nextcloudConfigured: false, skillLibraryEnabled: true });
    expect(tools).toEqual([SKILL_LIBRARY_TOOL_NAME]);
  });

  it('la biblioteca de skills se retira cuando la interfaz desactiva crear skills', () => {
    const tools = addRokoAgentTools([], { nextcloudConfigured: true, skillLibraryEnabled: false });
    expect(tools).toEqual([NEXTCLOUD_TOOL_NAME]);
  });

  it('sin nada que añadir devuelve el mismo array, para que el llamante no toque el agente', () => {
    const existing = ['web_search'];
    expect(addRokoAgentTools(existing, none)).toBe(existing);
    expect(addRokoAgentTools(undefined, none)).toBeUndefined();
  });

  it('no modifica el array original al añadir', () => {
    const existing = ['web_search'];
    addRokoAgentTools(existing, both);
    expect(existing).toEqual(['web_search']);
  });

  it('usa los nombres que registra el catálogo de herramientas', () => {
    expect(NEXTCLOUD_TOOL_NAME).toBe('nextcloud_files');
    expect(SKILL_LIBRARY_TOOL_NAME).toBe('skill_library');
  });
});
