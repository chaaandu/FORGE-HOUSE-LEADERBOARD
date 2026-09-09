# Mesa Forge — Design System
> Built from **mesa brand book.pdf** (structure, layouts, elements & typography) re-skinned to the **Forge purple theme** (from Mesa Forge_Standardized PPT.pptx).

This is the importable brief for Claude Design / Lovart. Drop the contents of `logos/`, `assets/`, and `fonts/` into the tool's "Add fonts, logos and assets" drop zone, then paste the **Design System Prompt** at the bottom into the "Company name and blurb" + "Any other notes?" fields.

---

## Company Name & Blurb
**Mesa — School of Business.** A practitioner-led business school. **Mesa Forge** is its flagship one-year PGP / venture-building program. The Forge sub-brand keeps Mesa's confident, structured identity but swaps the parent green for a focused, ambitious **purple** system — used across teaching decks, program collateral, and student-facing material.

---

## Colour Palette

The Forge palette is a one-to-one re-skin of the brand book's green system. Each green role is mapped to a purple equivalent.

| Hex | Name | Role (brand-book equivalent) |
|-----|------|------------------------------|
| `#2A1849` | **Deep Aubergine** | Dark backgrounds, section dividers *(was Midnight Charcoal)* |
| `#452A74` | **Royal Purple** | Primary brand colour, headings on light *(was Bright Green)* |
| `#5A3A8E` | **Amethyst** | Secondary surfaces, fills, charts *(was Deep Teal)* |
| `#7C4DCC` | **Vivid Violet** | High-energy pop — CTAs, key callouts *(new energy accent)* |
| `#E4A7F3` | **Orchid** | Soft accent, highlights, the ring/comma motif *(was Tangerine)* |
| `#F5EDFB` | **Lavender Mist** | Light page background *(was Soft Mint)* |
| `#1D1C1D` | **Ink Black** | Body text on light |
| `#FFFFFF` | **White** | Text on dark, logo tile |

Full **tints & shades** (50–900) for Royal Purple, Vivid Violet, and Orchid are in `colors/tints_shades.png`; the core swatch sheet is in `colors/color_palette.png`.

**Colour personality:** Ambitious and focused but warm. Deep aubergine and royal purple carry authority; orchid and vivid violet add the optimistic, creative spark that keeps it from feeling corporate or heavy.

**Usage ratio (from the Forge deck):** ~60% backgrounds alternate Deep Aubergine (dark slides) and Lavender Mist (light slides); ~25% Royal Purple / Amethyst for type and surfaces; ~10% Orchid for motifs; ~5% Vivid Violet reserved for CTAs and emphasis.

---

## Typography

Carried over unchanged from the brand book — the type system is brand-agnostic; only colour changes.

| Font | Weight | Role |
|------|--------|------|
| **New York** (serif) | Bold | Display & section headers ("Color Palette", "Typography" cover words) — elegant, sophisticated |
| **Manrope** | Bold / SemiBold | Slide titles, UI headings |
| **Manrope** | Medium / Regular | Body copy, captions |
| **Proxima Nova** | Regular / Bold | Alternate body / supporting text (embedded in the Forge deck) |

> **Font notes:** *Manrope* is on Google Fonts (free). *Proxima Nova* is a commercial font (Adobe Fonts). *New York* is Apple's system serif — substitute **Newsreader** or **Fraunces** (Google Fonts) as a close free alternative for headers. The `.fntdata` files in `fonts/` are PowerPoint-proprietary reference blobs; design tools should match by name.

**Type rules:** Headers in New York (serif) for a classy editorial feel; everything else in Manrope. Generous weight contrast — bold titles over light, airy body. Avoid italics except for emphasis.

---

## Logo Files

| File | Description | Use on |
|------|-------------|--------|
| `logos/mesa_logo_on_dark.png` | Full lockup — white "Mesa / SCHOOL OF BUSINESS" + white tile with aubergine **m** | Dark aubergine / violet backgrounds |
| `logos/mesa_logo_on_light.png` | Full lockup — aubergine wordmark + white tile | Lavender Mist / white backgrounds |
| `logos/mesa_logomark_tile.png` | Logomark only — rounded white tile with the **m** mark | App icon, footer, avatar, tight spaces |

**Logo rules (from brand book):** maintain clearance space of ½ the tile height on all sides; minimum width ~120px digital; never rotate, stretch, recolour the **m**, or add effects. On busy backgrounds, place the lockup on a solid tile.

---

## Visual Motifs

- **The "comma" brand element** — Mesa's signature golden-spiral leaf shape. Provided in two Forge colourways: `assets/brand_element_violet.png` (bright orchid/violet, for dark backgrounds) and `assets/brand_element_aubergine.png` (deep aubergine, for light backgrounds). Use large, cropped off an edge, as a hero graphic or accent.
- **Concentric ring motif** — soft Orchid → Lavender gradient rings radiating from a bottom-right / corner anchor. See `assets/bg_dark_rings.png` (on aubergine) and `assets/bg_light_rings.png` (on lavender). This is the dominant Forge texture — every slide carries a faint version.
- **Layout pattern: dark/light alternation.** Section dividers and "moment" slides (Opening, Break, Showcase, Q&A) are **Deep Aubergine** with white type and a violet comma; content slides are **Lavender Mist** with royal-purple type and light rings. This rhythm is the core of the Forge look.
- **Orchid dot** — small filled orchid circle used as a bullet / spark accent near titles (replaces the brand book's small tangerine blob).

**Iconography:** brand book uses both filled and line icon sets. For Forge, render the same geometric icons in Royal Purple (`#452A74`) on light, or White on dark, with Orchid for the occasional highlight. Keep 2px line weight, rounded joins.

**Illustration:** flat-style, geometric, built from the palette — deep aubergine bases, royal-purple mid-tones, orchid highlights, vivid-violet sparks. No greens.

---

## Reference Slides
`slides/01_section_divider_dark.jpg`, `slides/02_content_light.jpg`, `slides/03_agenda.jpg` — show the dark-divider, light-content, and agenda layouts as actually built in the Forge deck.

---

## Design System Prompt (copy-paste for Claude Design / Lovart)

> **Company name and blurb:**
> Mesa — School of Business. A practitioner-led business school. "Mesa Forge" is its flagship one-year PGP / venture-building program, using a focused purple identity for all teaching and program material.
>
> **Design notes:**
> - **Primary colour:** Royal Purple `#452A74` (headings, brand) on Lavender Mist `#F5EDFB` light backgrounds.
> - **Dark surfaces:** Deep Aubergine `#2A1849` with white type — used for section dividers and "moment" slides.
> - **Secondary:** Amethyst `#5A3A8E` for surfaces, fills, charts.
> - **Accents:** Orchid `#E4A7F3` for the signature comma/leaf element, ring motifs, bullet dots and highlights; **Vivid Violet `#7C4DCC` reserved for CTAs and high-energy emphasis only** (~5% weight).
> - **Body text:** Ink Black `#1D1C1D` on light, White on dark.
> - **Fonts:** New York / Newsreader (serif) for display headers; Manrope Bold for titles; Manrope Regular for body; Proxima Nova as alternate body.
> - **Layout:** alternate dark aubergine and light lavender slides; faint Orchid→Lavender concentric rings anchored bottom-right on every surface.
> - **Motifs:** Mesa golden-spiral "comma" leaf (orchid on dark, aubergine on light), concentric corner rings, small orchid bullet dots.
> - **Logo:** rounded white tile with aubergine "m" + "Mesa / SCHOOL OF BUSINESS" wordmark; white version on dark, aubergine wordmark on light.
> - **Tone:** ambitious, structured, warm, optimistic — confident but not corporate. No green anywhere.
