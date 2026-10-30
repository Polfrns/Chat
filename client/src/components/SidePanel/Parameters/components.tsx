import { ComponentTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import {
  DynamicCombobox,
  DynamicDropdown,
  DynamicCheckbox,
  DynamicTextarea,
  DynamicSlider,
  DynamicSwitch,
  DynamicInput,
  DynamicTags,
} from './';
import useChatWebSearch from '~/hooks/Chat/useChatWebSearch';
import { useLocalize, type TranslationKeys } from '~/hooks';

export const componentMapping: Record<
  ComponentTypes,
  React.ComponentType<DynamicSettingProps> | undefined
> = {
  [ComponentTypes.Slider]: DynamicSlider,
  [ComponentTypes.Dropdown]: DynamicDropdown,
  [ComponentTypes.Switch]: DynamicSwitch,
  [ComponentTypes.Textarea]: DynamicTextarea,
  [ComponentTypes.Input]: DynamicInput,
  [ComponentTypes.Checkbox]: DynamicCheckbox,
  [ComponentTypes.Tags]: DynamicTags,
  [ComponentTypes.Combobox]: DynamicCombobox,
};

function ChatWebSearchSetting(props: DynamicSettingProps) {
  const search = useChatWebSearch();
  if (!search.isCustom) return <DynamicSwitch {...props} />;
  return (
    <DynamicSwitch
      {...props}
      description={search.bridge ? props.description : 'com_ui_web_search'}
      descriptionCode
      conversation={
        props.conversation ? { ...props.conversation, web_search: search.enabled } : null
      }
      setOption={(key) =>
        key === 'web_search'
          ? (value) => {
              if (!props.readonly && search.available) search.setEnabled(value === true);
            }
          : props.setOption(key)
      }
    />
  );
}

/**
 * Keeps unavailable API controls visible and prevents every editing path.
 * `chatScoped` routes `web_search` to the active chat's toggle; the agent builder
 * turns it off so the switch edits the agent's own model parameters.
 */
export function DynamicSetting({
  component,
  unsupportedReason,
  chatScoped = true,
  ...props
}: DynamicSettingProps & { chatScoped?: boolean }) {
  const localize = useLocalize();
  let Component = component ? componentMapping[component] : undefined;
  if (chatScoped && props.settingKey === 'web_search') {
    Component = ChatWebSearchSetting;
  }
  if (!Component) return null;
  if (!unsupportedReason && !props.readonly) return <Component {...props} />;
  return (
    <div className="col-span-full text-text-secondary opacity-50 grayscale">
      <fieldset
        disabled
        aria-describedby={unsupportedReason ? `${props.settingKey}-unavailable` : undefined}
      >
        <Component {...props} readonly setOption={() => () => undefined} />
      </fieldset>
      {unsupportedReason && (
        <p id={`${props.settingKey}-unavailable`} className="mt-1 text-xs text-text-secondary">
          {unsupportedReason.startsWith('com_')
            ? localize(unsupportedReason as TranslationKeys)
            : unsupportedReason}
        </p>
      )}
    </div>
  );
}
