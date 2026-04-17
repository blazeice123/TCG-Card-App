# Netlify Setup

## Basic Settings

- publish folder: `web`
- functions folder: `netlify/functions`
- build command: none

`netlify.toml` already points to the right places.

## What The Web App Can Do

- load your starter card list
- load demo cards instantly
- import a page photo or a single-card photo
- generate a demo image so you can test fast
- find cards on the page
- read the card text
- guess the best match from your card list
- let you fix bad guesses
- save cards to a local collection
- check a rough eBay value after you confirm the card
- save a price by hand if needed

## Important Pricing Note

The eBay check is best effort.

- if it works, you get a rough number from recent sold listings
- if eBay blocks the check, the app gives you a sold-listings link so you can type in a price yourself

That keeps the app useful even when automatic pricing is flaky.

## Quick Test Links

- `?demo=page`
- `?demo=single`
- `?seed=1`

## Storage Note

Right now everything is saved in the browser on that device.

That is perfect for fast MVP testing.
It is not meant to be the forever storage system for a giant production app.
