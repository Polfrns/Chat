import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import useChatWebSearch from '~/hooks/Chat/useChatWebSearch';

function WebSearch() {
  const localize = useLocalize();
  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const context = useBadgeRowContext();
  const search = useChatWebSearch();
  if (!canUseWebSearch) {
    return null;
  }
  if (!context) {
    return null;
  }
  const { webSearch: webSearchData, searchApiKeyForm } = context;
  const { toggleState: webSearch, debouncedChange } = webSearchData;
  const { badgeTriggerRef } = searchApiKeyForm;

  if (search.bridge) {
    return (
      <CheckboxButton
        className="max-w-fit disabled:opacity-50 disabled:grayscale"
        checked={search.enabled}
        disabled={!search.available}
        setValue={({ value }) => search.setEnabled(value === true)}
        label={localize('com_ui_web_search')}
        isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
        icon={<Globe className="icon-md" aria-hidden="true" />}
      />
    );
  }

  return (
    <CheckboxButton
      ref={badgeTriggerRef}
      className="max-w-fit"
      checked={webSearch}
      setValue={debouncedChange}
      label={localize('com_ui_web_search')}
      isCheckedClassName="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
      icon={<Globe className="icon-md" aria-hidden="true" />}
    />
  );
}

export default memo(WebSearch);
