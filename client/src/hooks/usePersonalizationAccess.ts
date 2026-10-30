import { PermissionTypes, Permissions } from 'librechat-data-provider';
import useHasAccess from './Roles/useHasAccess';

export default function usePersonalizationAccess() {
  const hasMemoryOptOut = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  /** The Roko workspace switch is a user-global MCP preference, not a conversation option. */
  const hasWorkspaceMcp = true;
  const hasAnyPersonalizationFeature = hasMemoryOptOut || hasWorkspaceMcp;

  return {
    hasMemoryOptOut,
    hasWorkspaceMcp,
    hasAnyPersonalizationFeature,
  };
}
