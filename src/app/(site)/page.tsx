import { Hero } from "@/components/site/Hero";
import { CardUpload } from "@/components/site/CardUpload";
import { CardReading } from "@/components/site/CardReading";
import { Soils } from "@/components/site/Soils";
import { Crops } from "@/components/site/Crops";
import { Fertilizers } from "@/components/site/Fertilizers";
import { Weather } from "@/components/site/Weather";
import { Prediction } from "@/components/site/Prediction";
import { Proof } from "@/components/site/Proof";

export default function Home() {
  return (
    <>
      <Hero />
      {/* The card goes in first, immediately after the promise. Everything
          below is what we do with it once we have it. */}
      <CardUpload />
      {/* And immediately what comes back off it. Directly under the upload
          because the two are one argument: hand it over, see it read. */}
      <CardReading />
      {/* Soil, then crop, then fertilizer — the order the product works in. */}
      <Soils />
      <Crops />
      <Fertilizers />
      {/* Weather closes the advice: a fertilizer schedule you can't time
          against rain is a schedule nobody can act on. It is also the one
          section here running on real data rather than a fixture. */}
      <Weather />
      {/* The three models' answers, and the first thing on the page that is a
          result rather than a description of one. */}
      <Prediction />
      {/* `<Outcomes />` — the "What you get" section — came off the page. The
          component is left in the tree rather than deleted; it is three
          outcomes with real copy, and re-mounting it is one line. */}
      <Proof />
    </>
  );
}
