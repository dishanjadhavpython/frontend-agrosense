# AgroSense — design direction & build plan

> **Rev 2**, after a second pass on the references (farm dashboard / TaniPintar / CalArts GD).
> Rev 1 made dark the ground and the type shouted. That was a misread — see §1.
> REGUR's light paper ground now carries the whole product, and dark becomes punctuation.

---

## 1. What I got wrong in rev 1, and what I actually see

Rev 1 built everything on "dark cinematic ground + oversized condensed type." Looking harder,
that isn't what these three pages do:

- **TaniPintar's headlines are not loud.** *"Empowering farmers with smart choices."*
  *"Ready to grow smarter?"* — normal width, medium weight, dark grey on white. Friendly, not
  shouted. I'd imported that from a fourth reference that isn't in this set.
- **Dark appears exactly once per page, as emphasis.** The dashboard has one dark element (the
  floating readout card) against a light green-grey page. TaniPintar has one dark band (the
  closing "Join Our Community Now"). Both are punctuation marks.
- **CalArts is the outlier, and it's contributing one thing** — the hand-drawn mark layer and the
  highlighter-yellow accent — not its black ground.

So the corrected through-line:

| | The move | Where it came from |
|---|---|---|
| **1** | Light, generous, rounded, airy ground — soft shadows, 16–20px radii | dashboard, TaniPintar |
| **2** | Green used as a full categorical *scale*, pale wash → near-black | dashboard donut + heatmap, TaniPintar's plot blocks |
| **3** | Photography inside rounded containers, with UI panels overlapping the edges | dashboard, TaniPintar — **the single most repeated device** |
| **4** | One dark moment per page, for emphasis only | dashboard readout card, TaniPintar closing band |
| **5** | A hand-made mark, and a highlighter, over the machine grid | CalArts |

What we leave behind: CalArts' legibility-last black ground (the scribble is the idea; the
illegibility isn't), and TaniPintar's isometric vector diorama — ours should be photographic,
because we have real aerials and they read as truth where vector art reads as a diagram.

**This resolves rev 1's biggest problem for free.** I'd written a whole section justifying a
dark public surface against a light app surface, and the accessibility conflict that created.
There is no conflict now. One system, one ground, everywhere.

---

## 2. One surface, one system

REGUR's paper ground carries the public pages *and* the app. Same tokens, same radii, same
type. The pages differ in density, not in kind — marketing pages breathe, the dashboard packs in.

```
  PUBLIC (/)                          APP (/dashboard, /soil, /market, …)
  ─────────────────────               ─────────────────────────────────
  paper ground                        paper ground          ← same
  one dark band, at the close         one dark card, the plot readout
  photography large, few              photography small, many
  generous vertical rhythm            dense, scannable
```

This also means the whole product stays usable outdoors on a cheap Android in sunlight, which
was never negotiable — the audience is Marathi-speaking farmers in Maharashtra.

---

## 3. Tokens

### Colour — REGUR stands, plus a dark for punctuation

The existing palette in `globals.css` was already drawn from the subject (regur soil, Sangli
turmeric, Solapur pomegranate, water). No new hues. Two additions:

```css
/* --- Night: for the dark readout card and the closing band. Nothing else. --- */
--color-night:  #070c09;   /* near-black, green cast */
--color-chalk:  #f6e6c8;   /* primary text on night */
--color-mist:   #c9d4cb;   /* secondary text on night — 12:1 */
```

**The highlighter — the CalArts move, transposed.** CalArts marks its active nav with a yellow
block behind the text. We already have `haldi #e0a526`, which has been awkward because it fails
as text on paper (2.19:1) and `globals.css` warns about it. As a *highlighter wash behind dark
ink* it's perfect — `ink #14201a` on `haldi` is **~6.7:1**, and it's literally how a highlighter
works. That's the accent, and it costs us no new colour.

Used for: the active nav item, the one number that matters in a card, and the marks in §4.
Not used for: anything decorative.

**Green as a categorical scale.** The dashboard's donut and heatmap both use 4–5 tints of one
green. We already have `leaf-wash → leaf → leaf-deep`; fill in two intermediate steps and that
scale drives the rainfall calendar, the map's plot fills, and every chart.

**Status colours map to what already exists.** TaniPintar tints plot blocks green/yellow/orange
by condition. Our `i18n` dictionary already ships `stLow / stMedium / stHigh` and
`stSufficient / stDeficient` — so `anar / haldi / leaf` *is* the map legend. The vocabulary and
the palette were already the same three-colour language. Nothing new to invent.

### Type — four faces, four jobs

| Role | Face | Why |
|---|---|---|
| **Display** | **Anek Devanagari** (variable: `wdth` 75–125, `wght` 100–800) | Verified available via `next/font/google` with `devanagari` + `latin` subsets. The width axis lets one family do the friendly TaniPintar register *and* the rare oversized statement, in Marathi. Drawn by Ek Type, in India, for Indian scripts. |
| **Text** | **Mukta** (already in) | UI and body. Stays. |
| **Data** | **IBM Plex Mono** (already in) | Every measured value, tabular. Rule unchanged. |
| **Document** | **Tiro Devanagari Marathi** (already in) | One job: the report surface and pull-quotes, where it should read like a printed government document. That's what it's good at. |

Scale — **quieter than rev 1.** The working register is normal-width and medium-weight:

```
statement  clamp(2.5rem, 6vw, 5rem)    wdth 92   wght 600   tracking -0.02em
section    clamp(1.75rem, 3.5vw, 2.5rem) wdth 100  wght 600
card head  1.375rem                    wdth 100  wght 600
eyebrow    0.75rem                     wdth 112  wght 500   tracking 0.18em  uppercase
```

Only **two places on the whole site** get the CalArts treatment — the hero and the closing band.
Everywhere else, type behaves. Spending boldness in two places is what makes those two land.

**Devanagari caveat:** Marathi needs testing against real strings before anything is built on it.
Conjuncts (जोडाक्षरे) and the shirorekha tighten badly under compression. If `तुमच्या मातीला` breaks
up at `wdth 92`, hold Devanagari at 100 and let Latin compress — two variables, not one.

### Surfaces

```
radius       20px cards, 28px photo containers, 999px pills
shadow       0 1px 2px rgba(20,32,26,.04), 0 8px 24px rgba(20,32,26,.06)   ← soft, never harsh
border       1px --color-line on cards that sit on paper; none on photo containers
```

### Motion

`globals.css` already has the `prefers-reduced-motion` kill switch. **It does not stop `motion`
(framer) animations** — those are JS-driven and ignore the CSS override. Every animated component
must call `useReducedMotion()` and return the resting state. This is the single most likely
accessibility regression in this build.

House easing stays `--ease-regur`.

---

## 4. The signature — and it now opens the page

**"The card, marked."** A photograph of a real, printed Soil Health Card. Hand-drawn marks draw
themselves onto it as you scroll — a haldi highlighter swipe across `सामू 8.4`, an anar strike
through `नत्र`, an arrow out to the margin — and the plain-language reading appears alongside.

**Change from rev 1: this is now the hero, not section two.** It's the strongest thing we have
and the argument the whole product rests on — "you're holding a document you can't act on; we
read it for you." Holding it until the second scroll to run a generic photo-and-stats hero first
would be burying it.

```
┌──────────────────────── paper ───────────────────────────┐
│  ◈ अ‍ॅग्रोसेन्स            मराठी · EN         [ सुरुवात करा ]  │
│                                                          │
│   तुमच्या मातीला काय हवंय, ते आम्ही सांगू                      │
│                                                          │
│   ┌──────────────────────┐                               │
│   │ माती आरोग्य पत्रिका    │                               │
│   │ ─────────────────    │      ╭─ सामू ८.४               │
│   │ सामू      ▓8.4▓ ─────┼──────╯  तुमची जमीन क्षारयुक्त आहे. │
│   │ क्षारता     0.42     │         चुना टाकू नका.          │
│   │ सेंद्रिय कर्ब 0.51     │                               │
│   │ नत्र  ─────178─── ✗──┼──────╮                         │
│   │ स्फुरद     12.4      │      ╰─ नत्र कमी आहे            │
│   │ पालाश      241      │         युरिया ५० किलो/एकर      │
│   └──────────────────────┘         पेरणीनंतर ३० दिवसांनी    │
│      ↑ your actual card              ↑ what it means      │
│                                                          │
│   [ माती तपासा ]   नमुना कार्ड वापरा →                      │
└──────────────────────────────────────────────────────────┘
```

`▓8.4▓` is the haldi highlighter. `✗` and the arrows are hand-drawn strokes.

Built as SVG paths over the photo, drawn with `stroke-dashoffset` on scroll progress. Rough,
slightly overshooting strokes — a hand, not a plotter. Reduced motion: marks render complete.

Why it's the right risk: it takes CalArts' mark layer and grounds it in an artifact that genuinely
gets marked up — farmers annotate these cards — and marks belong on paper, not on a black screen.
Rev 1 put this on a dark ground, which was fighting itself.

---

## 5. The reusable device: photo containers with panels on the edge

The most repeated move across both product references, and rev 1 gave it one line. It should be a
named component, `<PhotoPanel>`, used everywhere:

```
   ┌───────────────────────────────────┐
   │                                   │
   │     [ photograph, 28px radius ]   │
   │                                   │
 ┌─────────────────┐                   │
 │ वरचं शेत · २ एकर  │ ← panel breaks    │
 │  ◜◝ ६२ गुण       │   the container's │
 │ सामू ८.४         │   edge            │
 └─────────────────┘                   │
   │                                   │
   └───────────────────────────────────┘
```

One prop decides whether the panel is paper (default) or night (emphasis). That single component
covers the landing's plot section, the dashboard's map readout, the crop cards, and the report
header — which is why it's worth building properly first.

---

## 6. Public surface

```
/ (site)
├─ hero          the AgroSense wordmark, and the card being marked. §4.
├─ upload        where the card actually goes in. Camera or file, image or PDF.
│
├─ soils         9 soil types      ─┐  three full-bleed infinite rows,
├─ crops         22 crops           ├─ tight vertical rhythm so they read
├─ fertilizers   7 fertilizers     ─┘  as one cluster, not three sections
│
├─ what-you-get  three outcomes, not three features.
├─ proof         numbers + one farmer, named, with village.
└─ close         the one dark band. Full-bleed dawn field, statement type, one CTA.
```

The three model outputs run in the order the product works in — read the soil, pick the crop,
then choose the bag. They share `<MarqueeRow>` and `<MarqueeCard>`, which is what keeps them
reading as one system rather than three near-misses, and they alternate drift direction so the
page doesn't turn into one long conveyor belt.

**No numbered markers anywhere on the site.** `how` used to be the exception — 01/02/03 over
photograph → we read it → you learn what to do, which was a real sequence and so an honest use of
numbering. It has been replaced by `upload`, and the three steps went into it rather than being
deleted: the drop zone *is* step 01, the strip beneath it says what gets read (02), and the button
is what happens next (03). Describing a process the visitor could simply start is a waste of the
one section directly under the fold.

`upload` takes its shape from the reference's generator panel — card, dashed drop zone with a
centred icon, a constraints pill, a full-width CTA — and drops that reference's tab bar and
settings dropdowns, which are machinery for a different problem.

It runs the full content width, split `1.55fr / 1fr`: the drop zone on the left, and a readout
column on the right carrying the format line, the six values that get read, and Continue. The
split is what fills the width — a form stretched to 1200px is not the same thing as a section
that earns it, and it lets the nutrient list be a real list instead of a run-on line.

The zone is a **photograph, not a panel**: `upload/wheat.jpg`, golden-hour wheat that was already
bokeh-soft in camera, with `blur-[3px] scale-110` (scaled because a blur samples past its own
edges and would otherwise feather a gap at the frame) under a near-even dark scrim. It stays dark
in both themes and sets chalk type, like the closing band — so the dashed rectangle floats *inside*
the frame and the photograph runs edge to edge behind it. The card is bounded by a hard 2px
`border-ink`: black on paper, a crisp light outline in the dark, the same instruction either way.

Three things it has to keep:

- **The camera leads on a phone, not drag-and-drop.** Nearly all of this audience arrives on a
  handset, and drag is a desktop metaphor they will never use. Which affordance shows is a CSS
  media question (`touch:` / `mouse:` variants, registered in `globals.css`), never a branch in
  the markup — see the traps in §9.
- **The action keeps one name.** "पुढे चला / Continue" from the moment it appears, disabled until
  there's a file. It changes weight, not wording: a quiet outline while it waits, solid the
  instant there's something to continue with. A greyed-out slab would make the one thing you
  cannot do the heaviest object on the card.
- **Show the photograph back, large.** The common failure is a blurred or clipped card, and the
  only way anyone catches that is by looking at it — so `object-contain` at a real size, never a
  filename chip and never `cover`, which crops away the corner the reading depends on. It sits on
  a paper-white plate even here: the card is a printed object, and a scan of it should read as one
  lying on the table.
- **Scrim strength is measured, not guessed.** Type over a photograph can't be checked from
  computed style — the background isn't a colour. Hide the type, screenshot the zone, and sample
  the actual pixels behind each line. At a `.50` mid stop the mist sub-line came out at 4.57:1:
  over the 4.5 line, with no margin at all for a photograph that might get swapped. `.55` puts it
  at 5.2:1 and looks no darker.

Accepts JPG/PNG/WebP/HEIC and PDF up to 10 MB. HEIC matters: iPhones shoot it by default and many
browsers report its MIME type as the empty string, so the check falls back to the extension.

### The twelve, and the reading chart

A Maharashtra Soil Health Card prints **twelve** properties — pH, EC, OC, N, P, K, S, Zn, Fe, Mn,
Cu, B — and so this reads twelve. They live in `src/data/soilReading.ts` with their units, their
ICAR critical limits, and one illustrative sample profile, because **two** places need to agree
about the same card: the sample card in the hero (a picture of the artifact) and the chart
(a picture of what we did with it). While those were separate literals they were quietly telling
a visitor two different stories about one document.

Pressing **Predict** opens the reading inside the same bordered card, under the upload — one
object, not two screens, so swapping the file and watching the numbers change is a single motion.

The chart is one horizontal bar per property, and the pairing is the whole point: a bar alone says
"178", which tells a farmer nothing, while a bar stopping short of its target says "178, and it
should have been 280", which is the entire advice at a glance. Three rules:

- **Every row is scaled to its own axis**, because the twelve share no units — nitrogen runs to
  700 kg/ha and boron to 2.5 ppm, and one shared axis would flatten eleven of them to nothing.
  Axes are not always zero-based either: a pH bar starting at 0 spends half its length in a range
  no soil occupies, so pH runs 4–10.
- **A window gets a block; a minimum gets a line.** Six of the twelve have only a lower critical
  limit — above it is simply sufficient. Shading that as a band fills most of the track and reads
  as "aim for the middle of this", which is not what the card means.
- **Divs, not a chart library.** These are proportions of a width with no trigonometry in sight,
  and `<ArcGauge>` already demonstrated what server/client float drift does to an SVG (§9).

**Extraction is real now.** Predict posts the card to `/api/card`, which proxies to the Python
reading service (`backend/`, and `BACKEND_PLAN.md` for how it got there). What comes back is the
twelve readings actually printed on that farmer's card, scored against the range printed beside
them, plus a soil-health score, a ranked crop and a fertilizer plan.

The standing `role="status"` notice was **promoted, not removed**. It still sits above the chart
and still carries the same duty — a farmer must never mistake a demonstration for their own
reading — but it now states provenance: which file, how many of twelve were found, and whether
the numbers came out of a PDF's text layer or out of OCR.

That last distinction is the one that earns the notice its place. A PDF read is exact. An OCR
read looks identical and is not: on a clean render of the test card Tesseract turns nitrogen
245.15 into 945.15, which is plausible, inside the plausible domain, and on the wrong side of the
threshold — it flips the advice from "apply urea" to "apply none". So OCR-sourced readings are
marked `unconfirmed` end to end and the panel turns amber and asks for a check against the paper.
Photographs are accepted because that is how most farmers will send a card, not because they are
as good as the PDF.

**Rows that could not be read are named, never filled in.** `readingsFromExtraction` returns them
separately and the chart omits them. Falling back to the sample value for an unread property
would put an invented number in a chart of measured ones, which is the same failure the notice
exists to prevent, committed one row at a time.

**The band comes off the card.** Each bar is drawn against the range that farmer's own lab
printed, not the ICAR constants in `soilReading.ts` — the promise is that we read *your* card, and
contradicting the paper in someone's hand loses the argument before it starts. Where the two
diverge materially (this card prints pH 7.5–8.9; ICAR says 6.5–7.5) the row is footnoted rather
than one being silently chosen.

### Green means "this is what you get back"

The three section headings that are model *output* — soil, crop, fertilizer — set in `leaf` via
`<SectionHead tone="output">`; every other heading stays `ink`. It is structure carrying meaning
rather than decoration, and nothing else on the page may borrow it. One class covers both themes
because `leaf` already flips: deep standing-crop green on paper (**5.6:1** measured) and
new-growth lime in the dark (**11.7:1**).

**The crop row.** The 22 crops the recommendation model can return, on a seamless loop, drifting
left at rest and driven by scroll —
scrolling down speeds it up, scrolling up reverses it (`useVelocity` → spring → `useAnimationFrame`,
with `wrap(-50, 0)` over two copies of the set so the seam never shows). It runs full-bleed, so it
is deliberately *not* a `<Section>`; the copy sits in the content column and the row spans the
body. Two rules it has to keep:

- **The cards carry no links.** A moving target you're meant to click is a usability trap. The row
  is something you watch; recommendation happens inside the app.
- **Reduced motion turns it into a plain scrollable row**, via `[data-marquee]` in `globals.css`
  rather than a JS branch — swapping structure on a media query the server can't see is exactly
  what breaks hydration.

The old `plots` section came off the public site. Its composition — aerial as canvas, dashed
boundary, stress clipped inside it, readout panel breaking the edge — is staged at
`src/components/app/PlotMap.tsx` for the dashboard (§7), where it was always headed.

---

## 7. App surface

REGUR, dense. Structure from the dashboard reference:

```
┌────┬────────────────────────────────────┬─────────────────┐
│ ◈  │  ┌ aerial photo of YOUR plot ─────┐│ आज · बारामती     │
│    │  │   ╭╌╌╌╌╌╌╌╌╌╌╮                 ││ ३१° · ढगाळ        │
│ ▣  │  │   ╎ ▓▓▓ stress ╎ ← anar wash   ││ पाऊस ६०%         │
│ 🌱 │  │   ╎  overlay   ╎                │├─────────────────┤
│ ☁  │  │   ╰╌╌╌╌╌╌╌╌╌╌╯ dashed boundary ││ पोषण स्थिती       │
│ ▤  │  │  ┌──────────────────┐          ││   ·⁙⁙⁙·  ६२      │
│ ₹  │  │  │ वरचं शेत · २ एकर   │ ← night  ││  ⁙      ⁙       │
│ 💬 │  │  │  ·⁙⁙· ६२ गुण      │   panel  ││ नत्र    ▁▃▅ कमी   │
│    │  │  │ सामू ८.४ · ओलावा ३२%│          ││ स्फुरद  ▅▅▅ मध्यम │
│ ⚙  │  │  └──────────────────┘          ││ पालाश  ▅▅▇ जास्त  │
│ 👤 │  └────────────────────────────────┘├─────────────────┤
│    │  ┌ पुढे काय करायचं ──────────────────┐│ बाजारभाव         │
│    │  │ • युरिया ५० किलो/एकर  ३० दिवसांनी  ││ सोयाबीन ₹४,७२० ▲│
│    │  │ • पाणी द्या           २ दिवसांत    ││ तूर    ₹७,१०० ▼ │
└────┴──┴─────────────────────────────────┴┴─────────────────┘
```

Taken from the reference, specifically:

- **The dotted arc gauge** (`·⁙⁙·`) — the semicircle built from a dot matrix, filled proportionally.
  A distinctive detail worth copying precisely; it reads as an instrument rather than a chart.
- Plot photo as canvas, dashed boundary, stress wash in `anar`.
- The one night panel, floating over the photo edge — `<PhotoPanel variant="night">`.
- Pill status badges in the table (`Healthy` / `Stable` → `पुरेसे` / `मध्यम`), tinted from the wash colours.
- The green density grid → **our rainfall calendar**, which is what that component was always
  secretly good at.

Left behind: the donut (a pie by another name — use a bar), and the desktop-first three-column
grid. **Mobile is primary here** — the rail becomes a bottom bar, the right column stacks under
the map.

---

## 8. Images — what to send me

Drop them in `public/img/<folder>/`. Originals at the largest size you have; I'll convert and
generate blur placeholders. **JPEG or PNG, not HEIC.**

**Status:** 32 images in, cropped and registered in `src/lib/assets.ts` — all 22 crops, 8 of 9
soils, the closing band and the farmer. Still outstanding: the **Soil Health Card**, a **sandy
soil** photo, and **7 fertilizer** photos.

| # | Folder | What | Count | Notes |
|---|---|---|---|---|
| 1 | `card/` | **A real printed Soil Health Card** — flat, straight-on, even light, filling the frame | 1–2 | **Still missing, and still the highest priority — this is the hero.** Redact the name/Aadhaar area; I'll mask it further. Creases and paper texture are good; they're the point. |
| 2 | `crops/` | **All 22 crop portraits.** Filenames are `crops/<model label>.jpg` — canonical list in `src/data/crops.ts` | **22 in ✓** | Complete. Cropped square, never upscaled past the source.<br>Two notes for any re-shoot: `pigeonpeas` is the only one on a white studio background, so it breaks the run visually; and several pulses arrived as *processed dal* rather than the standing crop, which is fine for recognition but inconsistent with the field shots around them. |
| 2b | `soils/` | **9 soil textures.** `soils/<key>.jpg`, list in `src/data/soils.ts` | **9 in ✓** | Complete. Eight came from the classifier's own training folders; `sandy` was supplied separately as a 663×391 landscape and centre-cropped to 391², which is safe because a texture has no subject to lose.<br>`black`, `cinder`, `laterite`, `peat` and `yellow` came from scraped thumbnails at 194–335px, so they're visibly soft on a 2x screen and worth reshooting. `alluvial` is a wide shot of a wet field rather than a texture close-up, so it breaks the run visually. Note the source sets also contain mislabelled and corrupt files — the yellow-soil folder's largest image is a flowering tree, and two alluvial files are RGB noise — so pick by eye, not by file size. |
| 2c | `fertilizers/` | **7 bag or granule shots.** `fertilizers/<key>.jpg`, list in `src/data/fertilizers.ts` | **7 in ✓** | Bag faces, picked over the granule shots in the same folder — a farmer recognises the sack, not the pile. Cropped square with an **upward bias, not centred**, so the printed grade clears the NPK bars.<br>Two are foreign bags and should be replaced when an Indian equivalent turns up: **`urea`** (Kentucky Green, US) and **`17-17-17`** (Weaver, US) — none of the supplied urea shots were Indian, and 17-17-17 had only the one. The other five are IFFCO / Coromandel GROMOR / Prions, which is exactly right.<br>**`14-35-14`** prints its grade small on the sack's side panel rather than large on the face, so the crop can only do so much; the card's own sub-line and bars carry it. |
| 2d | `upload/` | **The wheat field behind the upload zone** | **1 in ✓** | `wheat.jpg` — golden-hour close-up, already bokeh-soft in camera, which is why only 3px of extra blur is needed. Any replacement must survive the same treatment: re-measure the scrim (see §6) rather than assuming `.55` still holds. |
| 3 | `plots/` | **Top-down aerial/drone shots** of fields with visible boundaries | 4–6 | For the dashboard map canvas, not the landing page any more. Square-croppable. Phone-from-a-height is fine if no drone. |
| 4 | `people/` | **Farmers, with consent** — working, or holding the card | **1 in** | `farmer-portrait.jpg` is in, but it reads as stock and is only 612×408, so the proof photo runs 3:2 rather than a portrait crop. It currently sits beside an invented quote — see §10. A real, consented farmer with a name and village replaces both. |
| 5 | `close/` | **Wide field at dawn or dusk**, horizon low | **1 in** | `dawn-field.jpg` — the wheat field under cloud, cropped 2400×1200. Works well under the scrim. |
| 6 | `mandi/` | Market yard, sacks, weighing, the price board | 2–3 | The market surface. |
| 7 | `soil/` | Close-up of black regur soil, or a hand holding it | 1–2 | Demoted from rev 1's hero to a texture and section accent. Nice to have. |

If a category is thin, tell me which and I'll design around it rather than reaching for stock.

---

## 9. Build order

Each step is shippable and reviewable on its own.

1. ✅ **Tokens.** night/chalk/mist, the highlighter, the five-step green scale, shadow/radius.
   Anek Devanagari in `layout.tsx`, Geist dropped. **Devanagari width settled:** Marathi holds at
   `wdth 100` and Latin compresses to 92, driven off `:lang(mr)` in `globals.css` — verified in
   the browser, not assumed.
2. ✅ **`<PhotoPanel>`**, `<Statement>` / `<Eyebrow>` / `<Section>`, `<Reveal>`, `<ArcGauge>`,
   `<Button>`. All photographic surfaces read `src/lib/assets.ts` and fall back to a designed
   placeholder, so nothing is blocked on the shoot.
3. ✅ **The hero — the marked card.** Rendered as markup, not a photograph: the marks attach to
   real row elements, so they survive every viewport. Runs as a load sequence rather than on
   scroll, since it sits above the fold.
4. ✅ **Remaining public sections** — how, the three model rows (soils / crops / fertilizers),
   outcomes, proof, and the dark closing band in the footer.
5. **App shell** — icon rail / bottom bar, Clerk wired in.
6. **Dashboard** — map canvas and night readout first, then the arc gauge, then the right column.
7. **Remaining app screens** against the existing `i18n` dictionary, which already covers them.
8. **Pass:** sunlight legibility on a real phone, print stylesheet.
   Already done: no overflow at 320–1440, reduced motion honoured, keyboard focus, 48px targets,
   a no-JS fallback so `initial: opacity 0` can't blank the page on a dropped connection.

### Traps found while building — don't reintroduce

- **Never branch on `useReducedMotion()` while rendering.** It returns `null` on the server and a
  boolean on the client, so reduced-motion users get a hydration mismatch. Vary the `transition`
  only; transitions aren't serialised into the SSR HTML.
- **Round any trig-derived SVG coordinate.** `Math.sin`/`cos` disagree in the last bits between
  Node and Chrome, which is enough to desync every dot in `<ArcGauge>`.
- **Plex Mono has no Devanagari.** Mono is for measured values only; a Marathi word inside a mono
  span silently falls back to another face mid-line.
- **A soft scrim under light text is not a contrast strategy.** The NPK numerals sat ~12px up a
  `to top` gradient, where it had already faded to ~0.35 alpha — chalk on bright green. Hold the
  scrim near-opaque across the whole panel and fade only at its top edge.
- **Next's image optimizer caches hard in dev.** Replacing a file at the same path keeps serving
  the old one; `rm -rf .next/cache` and restart, or you'll debug a change that already worked.
- **Playwright element screenshots lose emulated `pointer:`.** `elementHandle.screenshot()` uses
  `captureBeyondViewport`, which re-lays-out the page — and the relayout drops the emulated
  pointer, so a mobile context renders the `pointer: fine` branch in the image while
  `matchMedia` and `getComputedStyle` on the very same page correctly report coarse. Trust the
  computed style; capture with a plain viewport `page.screenshot()` when the render itself is
  what's in question. Cost an hour chasing a bug that was never in the product.
- **Never put `whileInView` on an element that starts at zero size.** The nutrient bars animate
  from `width: 0`, and a zero-area element never satisfies an IntersectionObserver threshold — so
  every bar below the fold when the chart mounted stayed at `0px` indefinitely. It looked like an
  animation-timing problem and wasn't one; waiting longer never fixed it. Use `animate` when the
  thing appears in response to a click, or observe a parent that has size. Caught by asserting on
  the computed widths rather than by looking, which is the only way this shows up reliably.
- **When a design forks on a media feature, make one side the default.** Writing both branches as
  `hidden touch:block` / `hidden mouse:block` leaves a device matching neither — `pointer: none`
  is real — with a control that has no heading at all. Give the universally-true branch no
  variant and let the specific one override it.

- **An overlay that redraws what the photograph already says is the same fact twice.** The NPK
  bars were sized while the fertilizer cards were on placeholders and there was nothing behind
  them worth seeing. Real sacks arrived with the grade printed on the front, and the overlay was
  covering it to redraw it. Cut to roughly two-thirds height. Bars earn their place because they
  are *comparable* across the row — every bag prints its own grade, none prints how it measures
  against the six beside it — but only the comparison is theirs to make.

Route structure: **one** root layout owning `<html>`/`<body>`/`LanguageProvider`, with
`(site)/layout.tsx` and `(app)/layout.tsx` nested under it. Not two root layouts — that forces a
full page reload on every crossing, and sign-in crosses constantly.

---

## 10. Open questions

- **Where does the app's data come from** for now — hardcoded fixtures, or is there an API? The
  plan assumes fixtures under `src/data/` with the shapes `src/lib/format.ts` already implies.
- **38 images on one landing page.** ~5MB of source, served resized and lazily by `next/image`,
  but it's still a lot for a farmer on 2G. Worth measuring on a throttled connection before
  launch; if it bites, the fix is to render fewer cards per row until the row scrolls into view.
- **The crop set is national, the product is Maharashtra-first.** Apple, coffee, jute and kidney
  beans are in the model's 22 but aren't grown in the Deccan, so a Marathi-speaking farmer can be
  handed a recommendation they can't act on. Worth deciding whether to filter the model's output
  by region, or to keep all 22 and widen the product's stated scope. Not a blocker for the landing
  page; it is a real one for the app's recommendation screen.
- **The stress overlay on the plot map** — real NDVI data, or a painted illustration over the
  aerial for now? Changes whether step 6 is a day or a week.
- **Marathi copy for the public surface.** `i18n.tsx` covers the app well but the landing has
  `heroTitle`/`heroSub` and little else. I'll draft the rest in English and mark it for your
  review — better you correct my Marathi than I guess at register.

---

## 11. Dark mode

Opt-in, via a toggle in the header. **Light stays the default** — this product is used outdoors
in sunlight on cheap Android screens, and a dark UI in direct sun is harder to read, not easier.
Dark mode is for dawn, dusk and indoors, which is when a farmer is actually sitting with the app
rather than standing in a field. (One line in `src/lib/theme.ts` changes this to follow the
system preference instead, if that turns out to be wrong.)

### What the reference gives us

The ToyCad screens run on five moves, and four of them transfer:

| | The move | Taken? |
|---|---|---|
| Near-black ground with a green cast, not neutral grey | ✅ REGUR's `night` already is exactly this |
| **Acid lime as the primary accent** — CTA pills, active states | ✅ this is the one thing we're missing |
| Warm yellow as the secondary accent | ✅ `haldi`, unchanged |
| Solid bright blocks instead of outlined cards for emphasis | ✅ the closing band inverts to one |
| Bright white cards floating on black | ⚠️ only for the Soil Health Card — see below |

### The new colour, and why it's allowed

Every other AgroSense colour came from the subject, and this one has to as well or it's just a
borrowed accent. `leaf #2a6f4e` is standing jowar — beautiful on paper, but 3.3:1 on black, so it
can never carry text or a button in dark mode. We need a brighter green and there is a true one:

```
--color-leaf-5: #b7e04b   /* new growth — कोंब. The brightest green in a real field. */
```

It is the acid lime the reference leans on, and it earns its place: 12.9:1 on the dark ground,
and 10.7:1 the other way round with near-black text on a lime pill. It does both jobs.

### How the swap works

Two layers, and the first does almost all of it:

1. **Token overrides.** `@theme` in `globals.css` emits the light values onto `:root`. A
   `:root[data-theme="dark"]` block re-declares the same custom properties. Every existing
   utility — `bg-paper`, `text-ink`, `border-line`, `from-paper` — is already `var(--color-…)`,
   so the whole site flips without touching a component.
2. **A `dark:` variant** for the handful of places that need a real inversion rather than a
   recoloured one. Registered against the attribute, not the media query:
   `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`.

The `leaf` ramp **reverses meaning, correctly**. On paper, more density = darker. On black, more
density = brighter. `leaf-1` stays "faintest" and `leaf-5` stays "strongest" in both, so the
rainfall calendar, the plot fills and the arc gauge all keep working without a line of change.

### Three things that break, and the fix

Anything that assumed "ink is dark" inverts into light-on-light. There are exactly three:

- **The highlighter.** `marked` puts `--color-ink` on `--color-haldi`. Flip ink and you get
  1.3:1. A highlighter is *always* dark ink on a bright wash, in any theme.
- **The `onNight` button** on the closing band — same assumption.
- **The Soil Health Card.** It is a photograph of a physical object, not a UI surface. Real
  paper does not have a dark mode. It stays paper-white in both, which makes it read *better*
  against a dark page — the hero's light moment comes free.

All three take a token that deliberately does **not** flip:

```
--color-on-light: #14201a   /* text on a surface that is light in both themes */
```

### The closing band inverts

In light mode the band is the page's one dark moment. On a dark page that moment has nowhere to
go — a dark band on a dark page is not a moment. So in dark mode it becomes the opposite: the
photograph and its scrim drop away and the band turns into a **solid lime block with near-black
type**, which is precisely what the reference does with its "Get Started" and "Subscribe" cards.
One loud moment per page either way; only its polarity changes.

### No flash of the wrong theme

An inline script in `<head>` reads `localStorage` and sets `data-theme` on `<html>` before first
paint. React never renders that attribute, so it never tries to reconcile it — the same reason
this doesn't repeat the hydration bug from §9. The toggle itself reads through
`useSyncExternalStore`, matching how the language toggle works.

### As built

Everything above landed as written. Five things the plan didn't anticipate:

- **`<html>` still needs `suppressHydrationWarning`.** "React never renders the attribute" is
  true and still isn't enough: React diffs the *live* `<html>` element against the server HTML
  during hydration, sees a `data-theme` the server never sent, and warns. Suppression on that one
  element is the intended fix and does not extend into the tree, so real mismatches below still
  surface. Verified: warning gone, zero console errors in both themes.
- **A fourth thing broke, and it wasn't in the list of three.** The active pill in the language
  toggle is `bg-ink text-paper` — a quiet dark chip on paper, but inverted it became the
  *brightest object in the header*, louder than the lime CTA. A language selector outranking the
  call to action is a hierarchy bug, not a contrast one, so no contrast check would have caught
  it. It takes `dark:bg-line` and reads as a raised chip instead of a lit one.
- **`paper-island` generalises the Soil Health Card fix.** Rather than patching that component,
  there is now a utility that re-declares the light tokens locally. Anything inside keeps using
  `text-ink` and `border-line` with no idea a theme happened. Any future physical artifact — a
  printed report, a mandi receipt — gets the same treatment for one class.
- **`field-rows` needed a pitch variable.** The furrow texture is tuned for thumbnails. Reused at
  full-bleed on the lime band, the same 14px pitch read as corduroy. It now takes
  `--field-row-pitch` (58px on the band) and `--field-row-line`, since furrows are shadows on a
  lit surface and highlights on a dark one.
- **Two pre-existing contrast failures surfaced under measurement**, both light-mode:
  `text-leaf-3` on the step numbers in §How was 2.12:1 against a 3:1 requirement, and the Quote
  glyph in §Proof used a fixed ramp step for what is ornament. Fixed to `text-leaf` and
  `text-leaf/45`.

Verified at 320 / 390 / 768 / 1440 in both themes: no horizontal overflow, no console errors, no
failed requests, and every measurable text node clears WCAG AA. Toggle persists across reload and
the attribute is already correct at `DOMContentLoaded`, so there is no flash.
