import { useMemo } from 'react';
import { getSettingsKeys, applyModelAwareDefaults } from 'librechat-data-provider';
import type { SettingDefinition } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import { componentMapping, DynamicSetting } from '~/components/SidePanel/Parameters/components';
import { presetSettings } from 'librechat-data-provider';

export default function OpenAISettings({
  conversation,
  setOption,
  models,
  readonly,
}: TModelSelectProps) {
  const parameters = useMemo(() => {
    const [combinedKey, endpointKey] = getSettingsKeys(
      conversation?.endpointType ?? conversation?.endpoint ?? '',
      conversation?.model ?? '',
    );
    const settings = presetSettings[combinedKey] ?? presetSettings[endpointKey];
    if (!settings) return undefined;
    return {
      col1: applyModelAwareDefaults(settings.col1, endpointKey, conversation?.model ?? ''),
      col2: applyModelAwareDefaults(settings.col2, endpointKey, conversation?.model ?? ''),
    };
  }, [conversation]);

  if (!parameters) {
    return null;
  }

  const renderComponent = (setting: SettingDefinition | undefined) => {
    if (!setting) {
      return null;
    }
    const Component = componentMapping[setting.component];
    if (!Component) {
      return null;
    }
    const { key, default: defaultValue, ...rest } = setting;

    const props = {
      key,
      settingKey: key,
      defaultValue,
      ...rest,
      readonly: readonly || setting.readonly,
      setOption,
      conversation,
    };

    if (key === 'model') {
      return <DynamicSetting {...props} options={models} />;
    }

    return <DynamicSetting {...props} />;
  };

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <div className="flex flex-col gap-6 md:col-span-3">
          {parameters.col1.map(renderComponent)}
        </div>
        <div className="flex flex-col gap-6 md:col-span-2">
          {parameters.col2.map(renderComponent)}
        </div>
      </div>
    </div>
  );
}
