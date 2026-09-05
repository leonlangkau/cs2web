# UI skins — the two redesigns

GoyHub ships three complete front-ends. `classic` is the original liquid-glass
design (`public/css/style.css` + `public/js/fx.js`). `neon` and `prism` are
ground-up redesigns built on [React Bits](https://reactbits.dev) components
(vendored under `ui/src/reactbits/`, MIT + Commons Clause — fine to use in a
site, not to resell as components).

The active design is resolved per request in `functions/_lib/middleware.js`:
`?ui=<id>` (remembered in the `ghui` cookie) → cookie → `UI_THEME` var →
`classic`. The corner switcher (`uiSwitcher()` in `views/layout.js`) is on
while `UI_SWITCHER` is not `"0"`.

## How a skin is put together

| Piece | File(s) | What it is |
| --- | --- | --- |
| Registry | `functions/_lib/ui-skins.js` | id, label, tagline; env resolution |
| Server chrome | `functions/_lib/views/skins/<id>.js` | nav, footer, `<head>` extras, body hosts, **the landing page** (SSR fallback + JSON data block) |
| Site-wide stylesheet | `public/css/skin-<id>.css` | hand-written; styles **every** class the site renders (forum, admin, support chat, status page, forms, tables…) |
| React Bits bundle | `ui/src/skins/<id>/main.jsx` → `public/js/ui-<id>.js` + `public/css/ui-<id>.css` | cursor, backgrounds, nav enhancement, the landing app, inner-page enhancements |
| Fonts | `public/fonts/` | self-hosted only (`font-src 'self'`) |

`layout.js` builds a skinned document as:

```
<html lang="en" data-skin="<id>">
  <head> …meta… {skin.head(ctx)} <link skin-<id>.css> <link ui-<id>.css> <link ui-switch.css> <script boot.js>
  <body class="skin-<id> {skin.bodyClass} {page bodyClass}">
    <a class="skip-link" href="#main">
    {skin.chrome(ctx)}                 ← background / cursor hosts, optional
    {skin.nav(ctx)}                    ← <header id="site-nav" class="site-nav">…
    {announcement}{flash}{terms gate}  ← shared markup, classes: .announcement .flash .terms-gate …
    <main id="main">{page body}</main>
    {skin.footer(ctx)}
    {ui switcher}
    <script main.js defer> <script fingerprint.js defer> {page scripts} <script type="module" ui-<id>.js>
```

`fx.js` (classic effects) is **not** loaded under a skin. `boot.js`
(`.js` class, theme attr, IP-hide attr, reveal watchdog), `main.js`
(shoutbox, confirm dialogs, flash/announcement, email links) and the page
scripts (`captcha.js`, `support.js`, `status.js`, `crypto-pay.js`) are.
They create DOM with the classic class names — the skin stylesheet must style
those too (the inventory below includes them).

## Hard rules (the tests enforce most of these)

1. **CSP.** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'`.
   - No `style="…"` attributes in server markup. Per-element values go through
     CSS custom properties set from JS (`el.style.setProperty('--x', v)`) or classes.
   - React's `style={{}}` prop is fine (it writes the CSSOM), but **never** render a
     `<style>` element, `dangerouslySetInnerHTML` with styles, or `setAttribute('style')`.
     React Bits components that do this (`ASCIIText`, `TextPressure`, `GradualBlur`) are off-limits unless you patch them.
   - No external URLs at runtime: no Google Fonts, no picsum/unsplash demo images, no CDN scripts.
     Fonts come from `@fontsource*` npm packages copied into `public/fonts/`; images are inline SVG or `data:` URIs.
   - No `eval`/`new Function`; no WebAssembly (`@react-three/rapier` → `Lanyard` is out).
2. **Every class is styled.** `node tests/skin-inventory.mjs <id>` renders ~50 pages as
   visitor/member/admin and lists the classes your two stylesheets don't mention.
   It must print `0 missing`. Read `public/css/style.css` to learn what each
   class is *for* (layout, state, semantics) — then design it fresh. Do not copy the look.
3. **No-JS and crawlers.** The landing page is server-rendered inside `#rb-home`
   (real `<h1>`, copy, links, stats, features) and React replaces it on mount.
   The nav and footer are complete, keyboard-usable HTML before any JS runs.
4. **Behaviour stays.** Forms, CSRF fields, the download link rules
   (`/download/file` only for Paid+), admin links for staff, `href="/forum" /help /terms /privacy`
   in the chrome, the skip link, `name="_csrf"` wherever classic has it.
5. **Motion is opt-out.** `prefers-reduced-motion: reduce` → cursors off,
   backgrounds still or absent, text effects render their final state at once,
   no autoplaying loops. `(hover: hover) and (pointer: fine)` gates custom cursors
   and hover choreography; touch gets the static design.
6. **Performance.** Three.js-based components only via `import()` (lazy chunks
   are content-hashed as `public/js/rb-*.js`). OGL/GSAP/motion may be in the
   entry. Target ≤ 450 KB gzipped for the entry, and one WebGL context at a time
   per page. Pause canvases when off-screen / tab hidden.
7. **Accessibility.** Visible `:focus-visible` rings, AA contrast for body text
   and controls, decorative canvases `aria-hidden`, animated text keeps a
   readable copy for assistive tech (React Bits SplitText/DecryptedText do this;
   check anything you write).
8. **Responsive.** No horizontal overflow at 390px. The nav collapses sensibly.

## The landing page contract

`skin.home(ctx, data)` receives:

```js
{ stats: { users, downloads, threads, posts },        // numbers
  recentThreads: [{ id, title, category, username, updated_at }],  // [] unless canViewForum
  downloadMeta: { name, sha256, sizeKb },
  canDownload, canViewForum }                          // booleans (Paid+)
```

and must return `{ body, bodyClass: 'landing' }` (views/site.js wraps it in `page()`; skin modules must not import layout.js) with body containing:

```html
<div id="rb-home" class="rb-home">
  …server-rendered fallback: hero (h1 + sub + CTAs), stats, features, community, download CTA…
</div>
<script type="application/json" id="rb-home-data">{…}</script>   ← use jsonScript() from views/util.js
```

Data block shape (both skins, so the React apps can share helpers):

```js
{ user: { username, tier } | null,
  canDownload, canViewForum,
  stats, recentThreads: [{ id, title, category, username, updated }],   // updated = timeAgo() string
  downloadMeta, appVersion,
  features: [{ key, title, copy, icon }],   // icon = inline SVG path data string
  links: { download: '/download/file' | null, signup: '/auth/signup', login: '/auth/login', upgrade: '/upgrade', forum: '/forum', help: '/help' } }
```

CTA rules: Paid+ → download button to `/download/file` (`rel="nofollow"`, `data-download`);
logged in but not Paid → "Upgrade to download" → `/upgrade`; visitor → "Create a free account" → `/auth/signup`.
The download link must **not** appear in visitor markup or JSON.

`functions/_lib/views/skins/common.js` already provides `FEATURES`, `navLinks()`,
`footerColumns()`, `footerLegal()`, `primaryCta()`, `homeData()`, `homeDataScript()`
and `fallbackHome()`. Build the skin's markup on top of them; the data block
shape is theirs.

## Shared design tokens (both stylesheets must define these on `:root`)

The site-wide sheet (`skin-<id>.css`) owns the values; the bundle's CSS
(`ui-<id>.css`, written next to the React components) consumes them, with
sensible fallbacks. Names:

```
--bg --bg-2 --bg-3            grounds (page, raised, sunken)
--ink --ink-soft --muted      text
--accent --accent-2 --accent-3  brand light, secondary, tertiary
--on-accent                   text on a solid accent fill
--success --danger --warn     semantics (+ --tint-success/--tint-danger/--tint-warn)
--border --border-strong      hairline / control boundary
--panel --panel-2             surface fills (glass)
--glow                        the signature glow color (rgba)
--font-display --font-body --mono
--radius-ctl --radius-btn --radius-card --radius-xl --radius-tag
--nav-h                       header height (main content offsets by it)
--shadow --shadow-lift
```

## The chrome contract (what the React bundle can rely on)

- `<header class="site-nav" id="site-nav">` contains `a.brand[href="/"]`, `nav.nav-links[aria-label="Main"] > a` (with `.active` on the current section), and `.nav-auth` (login/signup or `a.nav-user` + logout `form.inline-form`). Skins may add a `button.nav-toggle` for mobile. React may **enhance in place** (attach effects, move links into a React Bits nav mounted inside the header) but must keep every link and form reachable.
- `<footer class="site-footer">` with `.footer-grid` (brand + link columns) and `.footer-bottom` (© line + legal line).
- `skin.chrome(ctx)` may emit hosts such as `<div id="rb-bg" aria-hidden="true"></div>` (fixed, behind everything) for the site-wide background.
- Inner pages are the shared views: `h1.section-title`/`h1`, `.panel`, `.feature-card`, `.btn`, `.stat`, tables, forms. Enhancements are selector-driven (see `ui/src/shared/`).
- The switcher `nav.ui-switch` is fixed bottom-left; leave that corner free. The download toast (`.dl-toast`) is bottom-right in classic; you may place yours anywhere except bottom-left.

## Working on a skin

```bash
node scripts/build-ui.cjs --only neon && node scripts/build-assets.cjs   # build one skin
node tests/skin-inventory.mjs neon                                        # unstyled classes
node --test tests/skins.test.mjs --test-name-pattern=neon                 # this skin's tests
node tests/serve.mjs 8791 neon &                                          # preview (admin/admin-test-password-1, player_one/supersecret1)
node scripts/shots.mjs http://localhost:8791 neon /tmp/shots-neon --mobile # screenshots + console audit
npm run build && npm test                                                 # full build + suite before committing
```

The preview server is the real app over an in-memory DB with a member, a
forum thread, a ticket and the help centre seeded.

Fonts: `npm i -D @fontsource/<family>` then copy the latin `woff2` files you use into
`public/fonts/` (keep ≤ ~250 KB per skin; the manifest hashes them; never name them `rb-*`).
Reference them with `@font-face` in `skin-<id>.css` — relative `url("/fonts/…")`.

## Design briefs

### `neon` — CYBERDECK
An operator's console. Near-black ground with phosphor light; the page is a HUD, not a brochure.
- **Palette**: ground `#05070c`/`#0a0e17`, ink `#dfe7ff`, primary phosphor cyan `#00f0ff`, secondary hot magenta `#ff2bd6`, acid lime `#c6ff3d` for success/positive, amber `#ffb020` warn, red `#ff3b5c` danger. Hairline borders `rgba(0,240,255,.18)`, grid `rgba(0,240,255,.06)`.
- **Type**: display **Chakra Petch** (`@fontsource/chakra-petch`), body **IBM Plex Sans** (`@fontsource/ibm-plex-sans`), data **JetBrains Mono** (already in `public/fonts/`). Uppercase, letter-spaced micro-labels; monospace for numbers, ids, timestamps.
- **Geometry**: cut corners (`clip-path` polygons on panels/buttons), corner brackets, scanlines, 2–4px radii, 1px rules, tick marks, `// SECTION 01` kickers, status LEDs. Panels are dark glass with a cyan inner glow; primary buttons are solid cyan with dark text.
- **React Bits to use (landing)**: `FaultyTerminal` (hero background, mouse-reactive, cyan tint, low `brightness`) + `Noise` overlay; `DecryptedText` kicker, `GlitchText` or `ScrambledText` H1, `TextType` subline; `StarBorder` + `Magnet` CTAs; HUD cards with `ElectricBorder` + `CountUp`/`Counter`; `LogoLoop`/`ScrollVelocity` ticker; `MagicBento` feature grid (spotlight, particles, tilt, magnetism, click ripple); `AnimatedList` for recent threads with a `Radar`/`GridScan`/`Scanner` backdrop; `Stepper` for "inject in 3 steps"; `Lightning` or `LetterGlitch` behind the final CTA with `ShinyText`.
- **Global (every page)**: `TargetCursor` (corner-bracket cursor that snaps to `.cursor-target` elements — give buttons, nav links, cards that class) + `ClickSpark`; `Dock` (bottom-centre quick nav) on desktop; nav links via `GooeyNav` mounted inside `#site-nav`; a cheap `DotGrid` or `Squares` ambient background at low opacity; `DecryptedText` on page `h1`s; GSAP scroll-reveals for sections; spotlight-on-hover for `.panel`/cards driven by `--mx/--my`.
- **Boot moment**: a ≤1s "SYSTEM ONLINE" terminal overlay on the first landing visit per session (sessionStorage), skippable, none under reduced motion.

### `prism` — HOLO-GLASS
A premium, luminous instrument. Deep indigo space with iridescent light passing through glass.
- **Palette**: ground `#07061a` → `#0e0b2e`, ink `#f2f0ff`, holographic set violet `#8b5cf6`, pink `#ff6ad5`, aqua `#5eead4`, gold `#ffd166`; glass `rgba(255,255,255,.06)` with a conic rainbow rim; bloom shadows in violet/pink. Success `#5eead4`-ish, danger `#ff6b8b`, warn `#ffd166`.
- **Type**: display **Syne** (`@fontsource/syne` 700/800), body **Manrope Variable** (`@fontsource-variable/manrope`, which also powers `VariableProximity`), data **JetBrains Mono**. Large, tight display sizes; generous line-height in body.
- **Geometry**: soft, big radii (20–32px), pill controls, thick glass with rim light, soft bloom glows, layered translucency, floating cards, wide gutters.
- **React Bits to use (landing)**: `Prism` (hero centrepiece, rotating refracting prism) with `Aurora` or `Iridescence` as ambient; `BlurText`/`SplitText` H1 with `GradientText` holo wording and `VariableProximity` on the kicker; `ShinyText` subline; `GlareHover` + `Magnet` CTAs; `CardSwap` stack of three "screens" (stats HUD, ESP view, skin changer) beside the headline; `CurvedLoop` marquee; `CountUp` stats in `SpotlightCard`/`GlassSurface`; feature section as `ScrollStack` (Lenis) or a `TiltedCard`+`GlareHover` grid; `FlowingMenu` or `AnimatedList` for recent threads; `Stepper` or `Folder` for install steps; `Orb` behind the final CTA with `StarBorder` button.
- **Global (every page)**: `SplashCursor` (fluid, low `SIM_RESOLUTION` for perf; only on fine pointers) + `ClickSpark`; `PillNav` mounted inside `#site-nav` (with `BubbleMenu`/`StaggeredMenu` on mobile if you like); optional `Dock` with `GlassIcons`; `Aurora` site-wide ambient at low opacity; `BlurText` on page `h1`s; GSAP reveals; glass sheen following the pointer on `.panel`/cards; `Magnet` on `.btn-primary`.

Both skins are single-theme (dark) — they ignore `data-theme` and set `color-scheme: dark`; the classic theme toggle is not rendered.
