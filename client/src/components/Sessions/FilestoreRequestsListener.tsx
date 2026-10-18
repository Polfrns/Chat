import { useRecoilValue } from 'recoil';
import { useFilestoreRequestsStream } from '~/data-provider';
import store from '~/store';

/**
 * Headless companion to the access/creation dialogs: opens the SSE request stream
 * for the active chat's session so pending requests are pushed (not polled) into
 * the dialogs' query caches.
 */
export default function FilestoreRequestsListener() {
  const conversation = useRecoilValue(store.conversationByIndex(0));
  useFilestoreRequestsStream(conversation?.sessionId ?? null);
  return null;
}
