# Netflix Web UI — Engineering Design Spec (condensed)

## Color tokens
--nf-red #E50914 (hover #F40612, active #B20710); --nf-bg #141414; --nf-black #000;
--nf-elevated #2F2F2F; --nf-white #FFF; --nf-grey #B3B3B3; --nf-muted #808080;
--nf-match #46D369; icon-outline rgba(255,255,255,.5); modal backdrop rgba(0,0,0,.7).

## Typography
`"Netflix Sans","Helvetica Neue",Helvetica,Arial,sans-serif`. Hero title 48-64/700; row title 24-32/700 (live site smaller ~1.4vw grey #E5E5E5); synopsis 18/400; body 16; meta 12-14; match 14/700.

## Spacing / grid
8px base (4/8/16/24/32/48/64). Page horizontal inset ~4vw (~60px @1920). Card gap ~4px (filmstrip). ~3vw between rows.

## Top nav
Fixed ~68px. Left: red wordmark. Links: Home, TV Shows, Movies, New & Popular, My List (collapse to Browse dropdown narrow). Right: search (magnifier expands to input), Kids, notifications bell, profile avatar (~32px rounded) + caret dropdown.
Behavior: transparent over billboard w/ top gradient `linear-gradient(180deg,rgba(0,0,0,.7),transparent)` → solid #141414 after ~66-100px scroll, `background-color .4s`. Inactive links #B3B3B3, hover #FFF.

## Billboard/hero
Full-bleed still → autoplaying muted looping trailer (`object-fit:cover`, behind text). Mute toggle + maturity badge lower-right. Title-logo PNG bottom-left (max-w ~35-40%). Synopsis 1-3 lines white 18px w/ shadow.
Buttons: Play = white pill black text play-icon (`#fff/#000`, radius 4, pad 8/24, 700; hover rgba(255,255,255,.75)); More Info = translucent grey pill white text ⓘ (`rgba(109,109,110,.7)`; hover .4).
Gradients: left `linear-gradient(90deg, rgba(20,20,20,1) 0-10%, transparent ~50-60%)`; bottom `linear-gradient(0deg,#141414 0%,transparent ~30-40%)`. Height ~80vh / 56.25vw feel.

## Row pattern (the heart)
Row title h2 top-left at inset; hover reveals "Explore All ›". ~6 cards visible @wide, partial card peeks at edges. Pagination chevrons in ~80px edge gutters on dark gradient, hidden until row hover, left arrow hidden at start. Page-slide = translateX one full visible set, ~750ms ease; 3-panel prerender. Segmented page dots top-right. Lazy-load visible+adjacent, images fade in.
Variants: Originals row = taller portrait cards; Top 10 = giant outlined rank numeral; Continue Watching = progress bar.

## Card
Landscape **16:9 boxart** (NOT portrait), radius 4px, `object-fit:cover`. Title baked into art. Continue-Watching progress bar 3-4px, red #E50914 on rgba(255,255,255,.3), width=% watched.
Hover (dwell ~400ms): scale ~1.3-1.5 via `transform` (GPU-cheap, flow undisturbed); siblings `translateX(25%)` apart; drop shadow + raise z-index; muted trailer autoplays after ~1-2s. Info panel drops below on #181818/#2F2F2F body:
- Circular icon buttons ~36-40px, 1px rgba(255,255,255,.5) border: Play (filled white/black triangle), Add (＋→✓), Like (👍), More Info (⌄ far right → detail modal).
- Meta line: green "97% Match" bold, maturity badge, duration/seasons, HD/4K.
- 2-3 dot-separated genre chips.

## Detail modal
Centered modal over rgba(0,0,0,.7); URL `?jbv=id`. Top: hero trailer/key-art + title-logo + Play(white pill) + Add + Like + mute/maturity, same gradients. Metadata two-column: left match%/year/rating/seasons/HD + synopsis; right Cast/Genres/"This show is:". Series: season dropdown + vertical episode list (index, 16:9 thumb, title+runtime, description, progress bar). "More Like This" grid (~3 across). "Trailers & More" row. "About" block. Open ~300-400ms scale+fade from card origin; close via X / backdrop.

## Motion
Card hover ~300ms `cubic-bezier(.4,0,.2,1)`, ~400ms dwell. Sibling push ~250-300ms. Trailer-in ~1-2s fade. Row page-slide ~750ms. Header ~400ms. Modal ~300-400ms ease-out. Image fade ~200-400ms. Gate everything behind `prefers-reduced-motion`.

## Profiles ("Who's watching?")
Full-screen centered #141414. "Who's watching?" white ~48px. Square avatars ~4px radius, ~120-200px, gap ~2vw, up to 5 across. Name grey #B3B3B3 below → white on hover; hover adds white border. "+ Add Profile" tile. "Manage Profiles" grey outlined button.

## Search
Magnifier → dark inline input rgba(0,0,0,.75), 1px white border. Live results as poster grid (16:9), uniform responsive, same inset/tight gaps, same hover-expand.

## Responsive (cards per row)
≥1400:6 / 1100-1400:5 / 800-1100:4 (nav collapses) / 500-800:3 (touch scroll) / <500:2 (portrait, no hover, tap→detail). Each card `width:calc((100% - gaps)/N)`, N switches at media queries; small screens use `overflow-x` touch scroll instead of arrow paging.

## Cheat sheet
card 16:9 radius4 gap4 6/row@≥1400; hover scale1.3 + siblings translateX(25%) 300ms 400ms-dwell; row-slide translateX 100% ~750ms; arrows 80px gutters w/ black gradient; header fixed 68px transparent+gradient→solid #141414 @80px 400ms; billboard muted autoplay + logo PNG + left/bottom vignette; progress 4px red on rgba(255,255,255,.3); backdrop rgba(0,0,0,.7); spacing 8px; inset ~4vw.
