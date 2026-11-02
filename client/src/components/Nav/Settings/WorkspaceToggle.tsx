import { useState, useEffect } from 'react';
import { Switch, useToastContext } from '@librechat/client';
import { useGetUserQuery, useUpdateWorkspacePreferencesMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

/** Roko: user-global switch for the workspace MCP used by non-Bridge models. */
export default function WorkspaceToggle() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const [workspaceEnabled, setWorkspaceEnabled] = useState(true);

  const mutation = useUpdateWorkspacePreferencesMutation({
    onSuccess: () =>
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' }),
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
      setWorkspaceEnabled((prev) => !prev);
    },
  });

  useEffect(() => {
    setWorkspaceEnabled(user?.personalization?.workspace !== false);
  }, [user?.personalization?.workspace]);

  const onToggle = (checked: boolean) => {
    setWorkspaceEnabled(checked);
    mutation.mutate({ enabled: checked });
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <div id="workspace-mcp-label">{localize('com_roko_workspace_mcp_enabled')}</div>
        <div id="workspace-mcp-description" className="mt-1 text-xs text-text-secondary">
          {localize('com_roko_workspace_mcp_description')}
        </div>
      </div>
      <Switch
        checked={workspaceEnabled}
        onCheckedChange={onToggle}
        disabled={mutation.isLoading}
        aria-labelledby="workspace-mcp-label"
        aria-describedby="workspace-mcp-description"
      />
    </div>
  );
}
