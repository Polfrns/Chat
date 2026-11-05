import { NEXTCLOUD_TOOL_NAME, SKILL_LIBRARY_TOOL_NAME } from 'librechat-data-provider';

export interface RokoAgentToolOptions {
  /** The deployment links Nextcloud (`NEXTCLOUD_URL` is set). */
  nextcloudConfigured: boolean;
  /** The interface does not turn skill creation off. The tool re-checks permissions on every call. */
  skillLibraryEnabled: boolean;
}

/**
 * Tools Roko adds to the chat agent of a request, on top of the ones it already has.
 *
 * Returns `existing` itself when there is nothing to add, so the caller can tell "unchanged" by
 * identity and leave the agent alone. Memory workers keep their own tool scope: apply this only to
 * the request's chat agent.
 */
export function addRokoAgentTools(
  existing: string[] | undefined,
  options: RokoAgentToolOptions,
): string[] | undefined {
  const injected = [
    ...(options.nextcloudConfigured ? [NEXTCLOUD_TOOL_NAME] : []),
    ...(options.skillLibraryEnabled ? [SKILL_LIBRARY_TOOL_NAME] : []),
  ];
  if (injected.length === 0) {
    return existing;
  }
  return [...new Set([...(existing ?? []), ...injected])];
}
