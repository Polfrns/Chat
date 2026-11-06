import type { IUser } from '@librechat/data-schemas';
import { createSafeUser } from '~/utils/env';
import { rokoWorkspaceIdentity } from './workspace';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tenantId: 'tenant-secret',
} as unknown as IUser;

/**
 * El «usuario seguro» alimenta los marcadores de MCP y de cabeceras de modelo
 * ({{LIBRECHAT_USER_...}}) y el contexto de ejecución. Upstream no deja que el tenant salga por ahí, y
 * Roko lo respeta: la identidad del workspace toma el tenant del contexto de la petición, no del usuario
 * seguro. Los dos lados tienen que seguir de acuerdo.
 */
describe('Roko hook: el usuario seguro no expone el tenant', () => {
  it('no incluye tenantId aunque el usuario lo tenga', () => {
    expect(createSafeUser(user)).not.toHaveProperty('tenantId');
  });

  it('conserva los campos que sí se pueden usar en marcadores', () => {
    expect(createSafeUser(user)).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
    });
  });

  it('la identidad del workspace sigue resolviendo el tenant sin depender del usuario seguro', () => {
    const identity = rokoWorkspaceIdentity({
      user: { ...createSafeUser(user), tenantId: 'tenant-a' },
      conversationId: 'c1',
    });
    expect(identity).toEqual({ tenantId: 'tenant-a', userId: 'user-1', conversationId: 'c1' });
  });
});
