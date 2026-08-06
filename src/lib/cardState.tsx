"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CardReadResult } from "./cardTypes";

/**
 * The card everyone on the page is talking about.
 *
 * Upload and "the card, read" are two sections a long way apart in the
 * document, and before this they were two different cards: one showed what you
 * had just handed over, the other showed a transcription fixture. A visitor
 * scrolling from one to the other saw their nitrogen change value on the way
 * down.
 *
 * So the read result lives above both. Deliberately not a fetch cache or a
 * store library — it is one object, replaced whole, for the lifetime of a
 * page view. Nothing is persisted: a soil card is somebody's document, and
 * keeping it in storage after they close the tab is not ours to decide.
 */

type CardState = {
  card: CardReadResult | null;
  setCard: (card: CardReadResult | null) => void;
  clear: () => void;
};

const Context = createContext<CardState | null>(null);

export function CardProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<CardReadResult | null>(null);
  const clear = useCallback(() => setCard(null), []);
  const value = useMemo(() => ({ card, setCard, clear }), [card, clear]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCard(): CardState {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useCard must be used inside <CardProvider>.");
  }
  return value;
}
