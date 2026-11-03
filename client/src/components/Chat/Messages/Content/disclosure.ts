import { createContext, useContext, useMemo } from 'react';
import { atom } from 'jotai';
import type { PrimitiveAtom } from 'jotai';

/** A reasoning part's key index, or one block inside a part that renders several
 *  (Roko Bridge progress). Block 0 keeps the part's own index so phase cards that
 *  address reasoning by part index still reach it. */
export type ReasoningDisclosureKey = number | `${number}:${number}`;

export function reasoningBlockKey(partKeyIndex: number, block: number): ReasoningDisclosureKey {
  return block === 0 ? partKeyIndex : `${partKeyIndex}:${block}`;
}

export type ReasoningDisclosures = Map<ReasoningDisclosureKey, PrimitiveAtom<boolean | undefined>>;

/** Owned by one message, above the layouts that can move its reasoning. */
export const ReasoningDisclosureContext = createContext<ReasoningDisclosures | null>(null);

export function reasoningDisclosure(
  disclosures: ReasoningDisclosures,
  index: ReasoningDisclosureKey,
) {
  let disclosure = disclosures.get(index);
  if (disclosure == null) {
    disclosure = atom<boolean | undefined>(undefined);
    disclosures.set(index, disclosure);
  }
  return disclosure;
}

export function useReasoningDisclosure(index: ReasoningDisclosureKey) {
  const disclosures = useContext(ReasoningDisclosureContext);
  return useMemo(
    () =>
      disclosures == null
        ? atom<boolean | undefined>(undefined)
        : reasoningDisclosure(disclosures, index),
    [disclosures, index],
  );
}

/** Panel spacing is genuine feature layout, so it stays here. The chevron
 *  appearance lives in `@librechat/client` as `disclosureChevronVariants`. */
export const toolPanelSpacingClassName = 'mb-2 mt-0';

export type ToolDisclosures = Map<string, PrimitiveAtom<boolean | undefined>>;

/** Kept above part keys and activity layouts; never shared between message views. */
export const ToolDisclosureContext = createContext<ToolDisclosures | null>(null);
export const ToolDisclosureKeyContext = createContext<string | undefined>(undefined);

export function useToolDisclosure() {
  const disclosures = useContext(ToolDisclosureContext);
  const key = useContext(ToolDisclosureKeyContext);
  return useMemo(() => {
    if (disclosures == null || key == null) {
      return atom<boolean | undefined>(undefined);
    }
    let disclosure = disclosures.get(key);
    if (disclosure == null) {
      disclosure = atom<boolean | undefined>(undefined);
      disclosures.set(key, disclosure);
    }
    return disclosure;
  }, [disclosures, key]);
}
