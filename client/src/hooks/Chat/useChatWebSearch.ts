import { useRecoilState } from 'recoil';
import {
  Constants,
  EModelEndpoint,
  getBridgeCapabilities,
  getEndpointField,
} from 'librechat-data-provider';
import type { BridgeCapabilities } from 'librechat-data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import { useGetEndpointsQuery } from '~/data-provider';
import useSetIndexOptions from '~/hooks/Conversations/useSetIndexOptions';
import { ephemeralAgentByConvoId } from '~/store';

interface ChatWebSearchState {
  bridge?: BridgeCapabilities;
  isCustom: boolean;
  available: boolean;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
}

/** Bridge search is a model option; other custom providers use a LibreChat tool. */
export default function useChatWebSearch(): ChatWebSearchState {
  const { conversation } = useChatContext();
  const { setOption } = useSetIndexOptions();
  const { data: endpoints } = useGetEndpointsQuery();
  const bridge = getBridgeCapabilities(conversation?.model);
  const isCustom =
    bridge != null ||
    getEndpointField(endpoints, conversation?.endpoint, 'type') === EModelEndpoint.custom;
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversation?.conversationId ?? Constants.NEW_CONVO),
  );
  const available = bridge?.supportsWebSearch ?? true;
  const enabled =
    available &&
    (bridge ? conversation?.web_search === true : ephemeralAgent?.web_search === true);

  const setEnabled = (value: boolean): void => {
    if (!available) return;
    if (bridge) {
      setOption('web_search')(value);
      return;
    }
    setEphemeralAgent((previous) => ({ ...previous, web_search: value }));
  };

  return { bridge, isCustom, available, enabled, setEnabled };
}
