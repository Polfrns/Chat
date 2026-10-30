import { useEffect } from 'react';
import { Constants } from 'librechat-data-provider';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '~/utils';

export default function useFocusChatEffect(textAreaRef: React.RefObject<HTMLTextAreaElement>) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (textAreaRef?.current && location.state?.focusChat) {
      logger.log(
        'conversation',
        `Focusing textarea on location state change: ${location.pathname}`,
      );

      const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
      const hasHover = window.matchMedia?.('(hover: hover)').matches;
      /**
       * A new stream may already have swapped `/c/new` for the real conversation URL
       * via `history.replaceState` (outside the router). React Router 7 runs this
       * effect in a deferred transition, so navigating to the router's stale
       * pathname here would revert that URL mid-stream.
       */
      const newConvoPath = `/c/${Constants.NEW_CONVO}`;
      const urlMovedOn =
        location.pathname === newConvoPath &&
        window.location.pathname !== newConvoPath &&
        window.location.pathname.startsWith('/c/');

      const path = `${location.pathname}${window.location.search ?? ''}`;
      /* Early return if mobile-like: has coarse pointer OR lacks hover */
      if (hasCoarsePointer || !hasHover) {
        if (urlMovedOn) {
          return;
        }
        navigate(path, {
          replace: true,
          state: {},
        });
        return;
      }

      textAreaRef.current?.focus();

      if (urlMovedOn) {
        return;
      }
      navigate(path, {
        replace: true,
        state: {},
      });
    }
  }, [navigate, textAreaRef, location.pathname, location.state?.focusChat]);
}
