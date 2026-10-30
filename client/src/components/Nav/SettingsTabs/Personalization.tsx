import { useState, useEffect } from 'react';
import { Switch, useToastContext } from '@librechat/client';
import {
  useGetUserQuery,
  useUpdateMemoryPreferencesMutation,
  useUpdateWorkspacePreferencesMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

interface PersonalizationProps {
  hasMemoryOptOut: boolean;
  hasAnyPersonalizationFeature: boolean;
  hasWorkspaceMcp: boolean;
}

export default function Personalization({
  hasMemoryOptOut,
  hasAnyPersonalizationFeature,
  hasWorkspaceMcp,
}: PersonalizationProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);
  const [workspaceEnabled, setWorkspaceEnabled] = useState(true);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_preferences_updated'),
        status: 'success',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_error_updating_preferences'),
        status: 'error',
      });
      // Revert the toggle on error
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  const updateWorkspacePreferencesMutation = useUpdateWorkspacePreferencesMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_error_updating_preferences'),
        status: 'error',
      });
      setWorkspaceEnabled((previous) => !previous);
    },
  });

  // Initialize state from user data
  useEffect(() => {
    if (user?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(user.personalization.memories);
    }
  }, [user?.personalization?.memories]);

  useEffect(() => {
    setWorkspaceEnabled(user?.personalization?.workspace !== false);
  }, [user?.personalization?.workspace]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const handleWorkspaceToggle = (checked: boolean) => {
    setWorkspaceEnabled(checked);
    updateWorkspacePreferencesMutation.mutate({ enabled: checked });
  };

  if (!hasAnyPersonalizationFeature) {
    return (
      <div className="flex flex-col gap-3 text-sm text-text-primary">
        <div className="text-text-secondary">{localize('com_ui_no_personalization_available')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm text-text-primary">
      {/* Memory Settings Section */}
      {hasMemoryOptOut && (
        <>
          <div className="border-b border-border-medium pb-3">
            <div className="text-base font-semibold">{localize('com_ui_memory')}</div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div id="reference-saved-memories-label" className="flex items-center gap-2">
                {localize('com_ui_reference_saved_memories')}
              </div>
              <div
                id="reference-saved-memories-description"
                className="mt-1 text-xs text-text-secondary"
              >
                {localize('com_ui_reference_saved_memories_description')}
              </div>
            </div>
            <Switch
              checked={referenceSavedMemories}
              onCheckedChange={handleMemoryToggle}
              disabled={updateMemoryPreferencesMutation.isLoading}
              aria-labelledby="reference-saved-memories-label"
              aria-describedby="reference-saved-memories-description"
            />
          </div>
        </>
      )}
      {hasWorkspaceMcp && (
        <>
          <div className="border-b border-border-medium pb-3">
            <div className="text-base font-semibold">{localize('com_roko_workspace_mcp')}</div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div id="workspace-mcp-label" className="flex items-center gap-2">
                {localize('com_roko_workspace_mcp_enabled')}
              </div>
              <div id="workspace-mcp-description" className="mt-1 text-xs text-text-secondary">
                {localize('com_roko_workspace_mcp_description')}
              </div>
            </div>
            <Switch
              checked={workspaceEnabled}
              onCheckedChange={handleWorkspaceToggle}
              disabled={updateWorkspacePreferencesMutation.isLoading}
              aria-labelledby="workspace-mcp-label"
              aria-describedby="workspace-mcp-description"
            />
          </div>
        </>
      )}
    </div>
  );
}
