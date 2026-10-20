import { ComponentTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { useLocalize, type TranslationKeys } from '~/hooks';
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


/** Keeps unavailable API controls visible and prevents every editing path. */
export function DynamicSetting({ component, unsupportedReason, ...props }: DynamicSettingProps) {
  const localize = useLocalize();
  const Component = component ? componentMapping[component] : undefined;
  if (!Component) return null;
  if (!unsupportedReason) return <Component {...props} />;
  return (
    <div className="col-span-full">
      <fieldset disabled aria-describedby={`${props.settingKey}-unavailable`}>
        <Component {...props} readonly setOption={() => () => undefined} />
      </fieldset>
      <p id={`${props.settingKey}-unavailable`} className="mt-1 text-xs text-text-secondary">
        {unsupportedReason.startsWith('com_') ? localize(unsupportedReason as TranslationKeys) : unsupportedReason}
      </p>
    </div>
  );
}
