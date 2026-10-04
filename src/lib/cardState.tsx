"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CardReadResult, PredictionResult } from "./cardTypes";
import type { Recommendation } from "./recommendTypes";
import type { SoilReadResult } from "./soilTypes";

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
  /** What the three models made of that card, once it has been asked for. */
  prediction: PredictionResult | null;
  setPrediction: (prediction: PredictionResult | null) => void;
  /**
   * What the recommendation engine made of a taluka, a season and — if the
   * farmer had one — this card's own readings.
   *
   * Separate from `prediction` rather than folded into it, because the two
   * answer different questions and can legitimately exist alone. A farmer with
   * no card at all still gets a recommendation from the taluka's own Soil
   * Health Card distribution; a farmer who has only uploaded a card and not
   * yet said where the field is gets a reading and no recommendation.
   */
  recommendation: Recommendation | null;
  setRecommendation: (recommendation: Recommendation | null) => void;
  /**
   * What a photograph of the ground was classified as.
   *
   * Independent of both of the above. It belongs to the soil photo, not to
   * the card and not to the taluka, so swapping either of those leaves it
   * alone — and it is never cleared by a new card, because the ground in the
   * picture did not change when a different document was uploaded.
   */
  soil: SoilReadResult | null;
  setSoil: (soil: SoilReadResult | null) => void;
  clear: () => void;
};

const Context = createContext<CardState | null>(null);

export function CardProvider({ children }: { children: ReactNode }) {
  const [card, setCardState] = useState<CardReadResult | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [soil, setSoil] = useState<SoilReadResult | null>(null);

  // A new card invalidates the old prediction. Leaving last card's soil and
  // crops on screen under a new card's readings is the one genuinely dangerous
  // state on this page — everything below the upload would be describing a
  // different field.
  // A new card invalidates the recommendation for the same reason it
  // invalidates the prediction: the dose plan on screen was interpolated to
  // the old card's nitrogen, and leaving it under a new card's readings is
  // advice about a field nobody is standing in.
  const setCard = useCallback((next: CardReadResult | null) => {
    setCardState(next);
    setPrediction(null);
    setRecommendation(null);
  }, []);

  const clear = useCallback(() => {
    setCardState(null);
    setPrediction(null);
    setRecommendation(null);
    setSoil(null);
  }, []);

  const value = useMemo(
    () => ({
      card, setCard,
      prediction, setPrediction,
      recommendation, setRecommendation,
      soil, setSoil,
      clear,
    }),
    [card, setCard, prediction, recommendation, soil, clear],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCard(): CardState {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useCard must be used inside <CardProvider>.");
  }
  return value;
}
