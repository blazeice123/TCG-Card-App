# Card Scanner

## What It Does

This app helps you turn a photo of sports cards into a simple collection you can actually use.

The flow is:

- take or import a photo
- let the app find each card
- let the app guess what each card is
- quickly fix anything wrong
- check price only after you confirm the card
- save the card and price in your collection

## What Is In Scope

- sports only: baseball, football, basketball
- raw cards only
- front side only
- page scans or page photos first
- one-card mode as a backup
- matching based on player, set, and card number
- unknown cards are allowed
- price comes after matching, never before

## What Is Not In Scope

- Pokemon or other TCGs
- graded slabs
- back-side scanning
- binder sleeve promises
- fancy variant detection as a core feature
- multi-user sync at launch

## What You Can Test Right Now

The first real test build is the web app in `web/`.

It already gives you:

- a clean mobile-style layout
- demo cards for instant testing
- whole-page mode and one-card mode
- card finding in the browser
- text reading in the browser
- best-guess matching
- a human review step
- a saved local collection
- a simple eBay-based price check after confirmation
- offline app-shell support as a PWA

## Fastest Way To Try It

1. Open the web app.
2. Go to `My List` and tap `Load Demo Cards`.
3. Go to `Scan` and tap `Try Demo`.
4. Tap `Find Cards`.
5. Check the guesses and save the right ones.

If you want a ready-made product view right away, use:

- `?seed=1`

If you want a demo scan loaded automatically, use:

- `?demo=page`
- `?demo=single`

## Project Shape

- `web/`: the live Netlify-friendly prototype
- `netlify/functions/`: the price-check helper
- `docs/schema.sql`: local-first data shape
- `sample-data/catalog-template.csv`: starter CSV shape
- `app/`: Android shell for the later native version

## Why This Setup Works

This version stays cheap and simple:

- the browser does the card finding and text reading
- the app stores data locally first
- the price check is separate from matching
- the flow is easy to move into Android and iPhone apps later

## Scale Plan

This is still a prototype, but it is pointed the right way for a bigger product.

- Keep image work on the device when possible to save money and speed things up.
- Keep matching, pricing, and saved collections split into clear modules.
- Add real backend pieces only when we need auth, backup, sync, and shared data.
- Reuse the same collection and review flow when we move to Google Play and the App Store.
