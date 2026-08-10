"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  Camera,
  Check,
  FileUp,
  FolderOpen,
  X,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { SAMPLE_READING, readingsFromExtraction } from "@/data/soilReading";
import { useCard } from "@/lib/cardState";
import type {
  CardErrorBody,
  CardReadResult,
  PredictionResult,
} from "@/lib/cardTypes";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { CardResult } from "./CardResult";

/**
 * Where the inputs actually go in.
 *
 * This replaced the three-step "How it works" panel, and takes its meaning
 * with it: the steps were photograph → we read it → you learn what to do, and
 * all three now live inside one working control.
 *
 * There are two inputs now, side by side and given equal weight, because they
 * answer different halves of the same question. The printed card carries the
 * twelve numbers — what is *in* the soil. A photograph of the soil itself is
 * what the classifier reads to name what *kind* of soil it is, which is the
 * other half of any real recommendation and the one thing the card never says.
 *
 * What gets read off the card moved below the pair. It was in a right-hand
 * column beside a single zone; with two zones it would have squeezed both into
 * strips too narrow to drop a file into, and the list is reference material —
 * it belongs under the thing you operate, not beside it.
 *
 * Almost all of this audience arrives on a phone, so the camera is the primary
 * path and drag-and-drop is the afterthought, not the reverse. Which one shows
 * is a CSS media question (`touch:` / `mouse:`), never a branch in the markup.
 */

/** iPhones shoot HEIC, and plenty of browsers report its type as "". */
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const MAX_BYTES = 10 * 1024 * 1024;

type Picked = {
  file: File;
  kind: "image" | "pdf";
  /** Object URL — images only, revoked when this is replaced. */
  url?: string;
};

/**
 * One input's worth of state. Both zones run through this, so the size limit,
 * the type check, the object-URL cleanup and the "same file twice" reset are
 * written once and cannot drift apart between them.
 */
function usePicked({
  allowPdf,
  mr,
  onChange,
}: {
  allowPdf: boolean;
  mr: boolean;
  onChange: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Object URLs outlive the component unless they're released by hand.
  useEffect(() => {
    const url = picked?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [picked]);

  const take = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;

      const isPdf =
        file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImage =
        file.type.startsWith("image/") || IMAGE_EXT.test(file.name);

      if (isPdf && !allowPdf) {
        setPicked(null);
        setError(
          mr
            ? "मातीचा फोटो हवा — PDF नाही."
            : "That needs to be a photo of the soil, not a PDF.",
        );
        return;
      }
      if (!isPdf && !isImage) {
        setPicked(null);
        setError(
          mr
            ? allowPdf
              ? "फोटो किंवा PDF च चालेल."
              : "फोटोच चालेल."
            : allowPdf
              ? "That has to be a photo or a PDF."
              : "That has to be a photo.",
        );
        return;
      }
      if (file.size > MAX_BYTES) {
        setPicked(null);
        setError(
          mr
            ? "फाइल १० MB पेक्षा मोठी आहे. थोडी लहान करून पाठवा."
            : "That file is over 10 MB. Send a smaller one.",
        );
        return;
      }

      setError(null);
      onChange();
      setPicked({
        file,
        kind: isPdf ? "pdf" : "image",
        url: isPdf ? undefined : URL.createObjectURL(file),
      });
    },
    [allowPdf, mr, onChange],
  );

  const clear = useCallback(() => {
    setPicked(null);
    setError(null);
    onChange();
    // Without this, choosing the same file twice in a row fires no change event.
    if (cameraInput.current) cameraInput.current.value = "";
    if (fileInput.current) fileInput.current.value = "";
  }, [onChange]);

  return { picked, error, take, clear, cameraInput, fileInput };
}

export function CardUpload() {
  const { t, lang } = useLang();
  const mr = lang === "mr";

  // Held above this section: "the card, read" further down the page has to be
  // describing the same document, not a fixture.
  const { card: result, setCard, setPrediction } = useCard();
  const [reading, setReading] = useState<boolean>(false);
  const [failure, setFailure] = useState<string | null>(null);

  // A new file invalidates the reading on screen. Leaving the old chart up
  // beside a different input is the one genuinely dangerous state here.
  const invalidate = useCallback(() => {
    setCard(null);
    setFailure(null);
  }, [setCard]);

  const card = usePicked({ allowPdf: true, mr, onChange: invalidate });
  const soil = usePicked({ allowPdf: false, mr, onChange: invalidate });

  // Only ever superseded by a newer submit, never by an older one landing late
  // — a farmer who swaps the card mid-read must not be shown the first card's
  // numbers under the second card's name.
  const submissionRef = useRef(0);

  const submit = useCallback(async () => {
    const file = card.picked?.file;
    if (!file) return;

    const submission = ++submissionRef.current;
    setReading(true);
    setFailure(null);
    setCard(null);

    try {
      const body = new FormData();
      body.append("card", file, file.name);
      if (soil.picked) body.append("soil", soil.picked.file, soil.picked.file.name);

      const response = await fetch("/api/card", { method: "POST", body });
      const payload = await response.json();
      if (submission !== submissionRef.current) return;

      if (!response.ok) {
        const error = payload as CardErrorBody;
        setFailure(error.message?.[mr ? "mr" : "en"] ?? null);
        return;
      }
      const read = payload as CardReadResult;
      setCard(read);

      // Straight on to the three models. Deliberately not awaited into the
      // button's pending state: the readings are already on screen and useful,
      // and holding them back behind a CNN forward pass would make the fast
      // half of the answer wait for the slow half. A failure here leaves the
      // prediction section on its worked example, which it labels as such.
      void (async () => {
        const predictBody = new FormData();
        predictBody.append("documentId", read.id);
        if (soil.picked) {
          predictBody.append("soil", soil.picked.file, soil.picked.file.name);
        }
        try {
          const predicted = await fetch("/api/predict", {
            method: "POST",
            body: predictBody,
          });
          if (!predicted.ok) return;
          if (submission !== submissionRef.current) return;
          setPrediction((await predicted.json()) as PredictionResult);
        } catch {
          // Silent by design — see above.
        }
      })();
    } catch {
      if (submission !== submissionRef.current) return;
      setFailure(
        mr
          ? "पत्रिका पाठवता आली नाही. जोडणी तपासून पुन्हा प्रयत्न करा."
          : "The card could not be sent. Check your connection and try again.",
      );
    } finally {
      if (submission === submissionRef.current) setReading(false);
    }
  }, [card.picked, soil.picked, mr, setCard, setPrediction]);

  const extracted = result ? readingsFromExtraction(result.soil_metrics) : null;

  return (
    <Section
      id="upload"
      eyebrow={t("secUpload")}
      heading={
        mr ? "पत्रिका इथे द्या, बाकीचं आमच्यावर" : "Hand us the card. That's it."
      }
      // Green, and `leaf` rather than a fixed hex so it stays a deep
      // standing-crop green on paper and climbs to lime in the dark, exactly
      // as the primary does everywhere else.
      headingClassName="text-leaf"
      lede={
        mr
          ? "फोटो काढा किंवा तुमच्याकडची PDF द्या. जुनं कार्ड असलं तरी चालतं. सोबत मातीचा फोटो दिलात तर मातीचा प्रकारही ओळखता येतो."
          : "Photograph it, or send the PDF you already have. An old card works fine. Add a photo of the soil itself and we can name its type too."
      }
    >
      <Reveal className="mt-10">
        {/* A hard 2px ink edge, not the usual hairline. This is the one thing
            on the page a visitor is asked to operate, and the border is what
            says so — it reads as black on paper and as a crisp light outline
            in the dark, which is the same instruction either way. */}
        <div
          className="overflow-hidden rounded-[var(--radius-card)] border-2 border-ink bg-surface"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {/* ---- The two inputs, side by side. ------------------------- */}
          <div className="grid md:grid-cols-2">
            <Dropzone
              zone={card}
              accept="image/*,application/pdf"
              bg="upload/wheat.jpg"
              badge={mr ? "पत्रिका" : "The card"}
              title={mr ? "पत्रिका इथे द्या" : "Add your card"}
              titleTouch={mr ? "पत्रिकेचा फोटो काढा" : "Photograph your card"}
              note={mr ? "JPG · PNG · PDF" : "JPG · PNG · PDF"}
              alt={mr ? "निवडलेल्या पत्रिकेचा फोटो" : "The card photo you selected"}
              mr={mr}
            />
            <Dropzone
              zone={soil}
              accept="image/*"
              bg="upload/soil.jpg"
              badge={mr ? "माती" : "The soil"}
              // Named as optional in the badge row rather than the heading —
              // the heading is the instruction and should read the same as its
              // neighbour's.
              optional={mr ? "ऐच्छिक" : "optional"}
              title={mr ? "मातीचा फोटो द्या" : "Add a soil photo"}
              titleTouch={mr ? "मातीचा फोटो काढा" : "Photograph the soil"}
              note={mr ? "JPG · PNG" : "JPG · PNG"}
              alt={mr ? "निवडलेल्या मातीचा फोटो" : "The soil photo you selected"}
              mr={mr}
              className="border-t-2 border-ink md:border-t-0 md:border-l-2"
            />
          </div>

          {/* ---- What we do with them. Full width, under the pair. ----- */}
          <div className="border-t-2 border-ink p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div>
                <h3 className="text-[17px] font-semibold text-ink">
                  {mr ? "माती आरोग्य पत्रिका" : "Soil Health Card"}
                </h3>
                <p className="mt-1.5 font-mono text-[12px] tracking-wide text-ink-mute">
                  JPG · PNG · PDF · 10 MB
                </p>
              </div>

              {/* The label never changes — an action is called the same thing
                  at every point in the flow. What changes is its weight: a
                  quiet outline while it waits, solid the moment there is
                  something to continue with. A greyed-out slab would make the
                  one thing you cannot do the heaviest object on the card. */}
              <Button
                type="button"
                variant={card.picked ? "primary" : "secondary"}
                disabled={!card.picked || reading}
                onClick={submit}
                className="w-full disabled:cursor-not-allowed disabled:text-ink-mute disabled:hover:bg-surface sm:w-auto sm:min-w-[13rem]"
              >
                {reading
                  ? mr
                    ? "वाचतो आहे…"
                    : "Reading…"
                  : mr
                    ? "अंदाज काढा"
                    : "Predict"}
                {card.picked && !reading ? (
                  <ArrowRight className="size-5" strokeWidth={1.8} aria-hidden />
                ) : null}
              </Button>
            </div>

            {/* Says what the button is waiting for, rather than leaving a
                disabled control to explain itself. */}
            {!card.picked ? (
              <p className="mt-3 text-[14px] text-ink-mute">
                {soil.picked
                  ? mr
                    ? "मातीचा फोटो मिळाला. आता पत्रिका द्या — बारा आकडे तिच्यावरच असतात."
                    : "Got the soil photo. Now add the card — the twelve readings are on it."
                  : mr
                    ? "पत्रिका दिल्यावर अंदाज काढता येईल."
                    : "Add your card and this turns on."}
              </p>
            ) : null}

            {/* A photograph goes through OCR and genuinely takes a few seconds.
                Saying so beats a button that looks stuck. */}
            {reading ? (
              <p role="status" className="mt-3 text-[14px] text-ink-mute">
                {mr
                  ? "पत्रिकेवरचे आकडे वाचले जात आहेत. फोटो असेल तर थोडा वेळ लागतो."
                  : "Reading the figures off your card. A photo takes a few seconds longer."}
              </p>
            ) : null}

            {/* The read failed. Said here rather than inside a dropzone,
                because this is about the card as a whole, not the file pick. */}
            {failure ? (
              <p
                role="alert"
                className="mt-4 rounded-[var(--radius-card)] border border-anar/50 bg-anar-wash px-4 py-3 text-[14px] leading-relaxed text-anar"
              >
                {failure}
              </p>
            ) : null}

            {/* What the old step 02 used to say, said where it matters.
                All twelve the card prints — the six macro readings and the
                six micronutrients. Full width now, so they run four across
                instead of two. */}
            <p className="eyebrow mt-7 border-t border-line pt-6 text-ink-mute">
              {mr ? "यातलं वाचलं जातं" : "What gets read"}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-4">
              {SAMPLE_READING.map((r) => (
                <li
                  key={r.key}
                  className="flex items-baseline gap-1.5 border-b border-line py-1.5 text-[14px] text-ink-soft"
                >
                  <span className="min-w-0 truncate">{t(r.key)}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-mute">
                    {r.symbol}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ---- The reading, once it has been pulled off the card. -------
              Inside the same bordered card rather than a section of its own:
              the upload stays visible above it, so swapping the card and
              seeing the numbers change is one object, not two screens. */}
          {result && extracted ? (
            <CardResult
              result={result}
              readings={extracted.readings}
              missing={extracted.missing}
              mr={mr}
            />
          ) : null}
        </div>
      </Reveal>
    </Section>
  );
}

/**
 * One input. A photograph, not a panel.
 *
 * Both zones are the same object with different copy, so the drag handling,
 * the dashed frame, the camera path and the preview stay identical between
 * them — two zones that behaved even slightly differently would read as two
 * different kinds of control.
 */
function Dropzone({
  zone,
  accept,
  bg,
  badge,
  optional,
  title,
  titleTouch,
  note,
  alt,
  mr,
  className,
}: {
  zone: ReturnType<typeof usePicked>;
  accept: string;
  bg: string;
  badge: string;
  optional?: string;
  title: string;
  titleTouch: string;
  note: string;
  alt: string;
  mr: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const [dragging, setDragging] = useState(false);
  const src = photo(bg);
  const { picked, error, take, clear, cameraInput, fileInput } = zone;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Fires on every child crossing too, so ignore the ones that land
        // somewhere still inside the zone.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "relative isolate flex min-h-[23rem] flex-col items-center justify-center overflow-hidden bg-night px-5 py-10 text-center sm:px-7",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          aria-hidden
          // Already soft in camera; this last bit of blur is only to stop the
          // subject competing with the type. Scaled up because a blur samples
          // past its own edges and would leave a feathered gap at the frame.
          className="scale-110 object-cover blur-[3px]"
        />
      ) : (
        // Until the photograph lands: the ploughed-rows surface every awaiting
        // image on this site falls back to, under the same scrim, so nothing
        // moves when the file arrives.
        <div
          className="field-rows absolute inset-0"
          style={
            {
              backgroundImage:
                "linear-gradient(160deg, var(--color-leaf-4) 0%, var(--color-leaf-5) 55%, var(--color-night-rise) 100%)",
              "--field-row-line": "rgba(246,230,200,0.10)",
              "--field-row-pitch": "26px",
            } as CSSProperties
          }
          aria-hidden
        />
      )}

      {/* Held near-even rather than a soft fade: the middle of these
          photographs is their brightest part, which is exactly where the type
          sits. The mid stop is tuned, not guessed — measured against the
          rendered pixels behind the type. */}
      <div
        className="absolute inset-0 -z-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,12,9,.70) 0%, rgba(7,12,9,.58) 48%, rgba(7,12,9,.76) 100%)",
        }}
        aria-hidden
      />

      {process.env.NODE_ENV !== "production" && !src ? (
        <span className="absolute top-3 right-4 z-10 font-mono text-[11px] text-mist/70">
          {bg}
        </span>
      ) : null}

      {/* The dashed rectangle floats inside the frame so the photograph can
          run edge to edge behind it. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-3 rounded-[14px] border-2 transition-colors sm:inset-4",
          picked ? "border-solid" : "border-dashed",
          dragging ? "border-leaf-5" : error ? "border-anar" : "border-chalk/35",
        )}
        aria-hidden
      />

      {/* Which of the two this is, said once, at the top. */}
      <p className="absolute top-6 left-6 z-10 flex items-center gap-2 sm:top-7 sm:left-7">
        <span className="eyebrow text-chalk">{badge}</span>
        {optional ? (
          <span className="rounded-full bg-chalk/15 px-2 py-0.5 text-[11px] font-medium text-mist ring-1 ring-chalk/25">
            {optional}
          </span>
        ) : null}
      </p>

      <div className="relative w-full">
        {picked ? (
          <PickedFile picked={picked} alt={alt} mr={mr} onClear={clear} />
        ) : (
          <>
            {/* Everything here defaults to the version that is true on any
                device — pick a file — and `touch:` upgrades it to the camera.
                Written this way round on purpose: `pointer: none` exists, and
                if both branches were conditional a device matching neither
                would get a drop zone with no heading. */}
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-chalk/15 text-chalk ring-1 ring-chalk/30 backdrop-blur-sm">
              <FileUp className="size-6 touch:hidden" strokeWidth={1.6} aria-hidden />
              <Camera
                className="hidden size-6 touch:block"
                strokeWidth={1.6}
                aria-hidden
              />
            </span>

            <p className="mt-4 text-xl font-semibold text-chalk">
              <span className="touch:hidden">{title}</span>
              <span className="hidden touch:inline">{titleTouch}</span>
            </p>
            {/* Drag is the one instruction a phone can't follow. */}
            <p className="mt-1 hidden text-mist mouse:block">
              {mr ? "किंवा फाइल इथे ओढून टाका" : "or drag it into this box"}
            </p>
            <p className="mt-1 font-mono text-[12px] text-mist/80">{note}</p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                variant="onNight"
                onClick={() => cameraInput.current?.click()}
                className="hidden touch:inline-flex"
              >
                <Camera className="size-5" strokeWidth={1.8} aria-hidden />
                {t("actTakePhoto")}
              </Button>
              <Button
                type="button"
                variant="onNightQuiet"
                onClick={() => fileInput.current?.click()}
              >
                <FolderOpen className="size-5" strokeWidth={1.8} aria-hidden />
                {t("actChooseFile")}
              </Button>
            </div>
          </>
        )}

        {/* Errors are the one thing here a screen reader must not miss. They
            sit inside the zone that raised them — with two zones, an error in
            a shared strip below could not say which file it was about. */}
        <p
          role="alert"
          className={cn(
            "mx-auto mt-4 max-w-xs rounded-md bg-anar/22 px-3 py-2 text-[14px] text-chalk ring-1 ring-anar/50",
            error ? "block" : "hidden",
          )}
        >
          {error}
        </p>
      </div>

      {/* Hidden, but real inputs — the buttons above just click them.
          `capture` is what opens the camera straight up on a phone. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => take(e.target.files?.[0])}
      />
      <input
        ref={fileInput}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => take(e.target.files?.[0])}
      />
    </div>
  );
}

/**
 * What you get back once a file is in. The photograph is shown at a real size
 * rather than as a chip: the single most common failure here is a blurred or
 * cropped card, and the only way anyone catches that is by looking at it.
 *
 * This sits on a photographic panel, so its type is chalk and mist — the fixed
 * pair — not `ink`, which would follow the theme and vanish here.
 */
function PickedFile({
  picked,
  alt,
  mr,
  onClear,
}: {
  picked: Picked;
  alt: string;
  mr: boolean;
  onClear: () => void;
}) {
  return (
    <div aria-live="polite">
      {/* Sits on paper-white even here — a card is a printed object, and a
          scan of it should read as one lying on the table, lit. */}
      <div className="mx-auto w-full max-w-[16rem]">
        {picked.kind === "image" && picked.url ? (
          <div className="relative aspect-4/3 overflow-hidden rounded-[var(--radius-card)] bg-[#fdfcf7] p-1.5">
            <Image
              src={picked.url}
              alt={alt}
              fill
              // A local blob has nothing to optimise, and object-contain rather
              // than cover because cropping a document is how you lose the
              // corner the reading depends on.
              unoptimized
              sizes="256px"
              className="object-contain"
            />
          </div>
        ) : (
          <PdfSheet mr={mr} />
        )}
      </div>

      {/* The filename is the one thing that proves we took the right file, so
          it wraps rather than truncating — a card is called
          "soil_health_card_02_sunita_bhoye.pdf" and the half that identifies
          it is the half at the end. */}
      <p className="mt-4 flex items-start justify-center gap-2 px-2 text-left">
        <Check
          className="mt-0.5 size-4 shrink-0 text-leaf-2"
          strokeWidth={2.5}
          aria-hidden
        />
        <span className="min-w-0 break-all font-medium text-chalk">
          {picked.file.name}
        </span>
      </p>
      <p className="tnum mt-1 text-[13px] text-mist">
        {mr ? "मिळाली · " : "Received · "}
        {formatSize(picked.file.size)}
      </p>

      <button
        type="button"
        onClick={onClear}
        className="mt-3 inline-flex min-h-12 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-mist transition-colors hover:text-chalk"
      >
        <X className="size-4" strokeWidth={2} aria-hidden />
        {mr ? "दुसरा फोटो द्या" : "Use a different file"}
      </button>
    </div>
  );
}

/**
 * A PDF, drawn as the thing it is.
 *
 * What was here before was a lucide file glyph floating in the middle of a
 * blank white rectangle the size of the photo preview beside it — an empty
 * page with an icon on it, which reads as something failing to load rather
 * than as a document received.
 *
 * So this draws a sheet of paper instead: a ruled block standing in for the
 * readings table, in the product's own ink and paper, with the corner turned
 * down. It is not a thumbnail and does not pretend to be — rendering the real
 * first page would mean shipping a PDF engine to the browser to show something
 * the farmer is holding anyway. It is a mark meaning "a document, and we have
 * it", which is all this slot has to say.
 */
function PdfSheet({ mr }: { mr: boolean }) {
  return (
    <div className="relative aspect-4/3 overflow-hidden rounded-[var(--radius-card)] bg-[#fdfcf7] p-1.5">
      <div className="relative flex h-full w-full flex-col justify-center gap-[7px] rounded-[10px] px-7">
        {/* The turned corner. Two triangles: the page's clipped corner and the
            fold's underside, a shade darker so it reads as thickness. */}
        <div
          className="absolute top-0 right-0 size-9"
          style={{
            background: "#e7e2d2",
            clipPath: "polygon(100% 0, 0 0, 100% 100%)",
          }}
          aria-hidden
        />
        <div
          className="absolute top-0 right-0 size-9"
          style={{
            background: "#cfc8b4",
            clipPath: "polygon(0 0, 100% 100%, 0 100%)",
          }}
          aria-hidden
        />

        {/* A heading rule, then the table. Deliberately uneven lengths — an
            even stack reads as a loading skeleton, which is the one thing this
            must not be mistaken for. */}
        <span className="h-[7px] w-2/5 rounded-full bg-[#8a5d06]" aria-hidden />
        <span className="mt-1 h-[3px] w-full rounded-full bg-[#c9c2ae]" aria-hidden />
        {["78%", "92%", "64%", "88%", "71%"].map((width) => (
          <span
            key={width}
            className="h-[3px] rounded-full bg-[#ddd7c6]"
            style={{ width }}
            aria-hidden
          />
        ))}
        <span className="mt-1 h-[3px] w-full rounded-full bg-[#c9c2ae]" aria-hidden />

        <span className="sr-only">
          {mr ? "PDF दस्तऐवज मिळाला" : "PDF document received"}
        </span>
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
