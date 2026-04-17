# 6-Step MVP Build Plan

The first validation loop can run in the Netlify web prototype before the same workflow is hardened in Android.

1. Freeze catalog and schema
   Lock the CSV header, SQLite schema, Room entities, and import rules so all later work targets one stable local data model.

2. Ship single-card import and OCR
   Support importing or capturing one front-side raw sports card, then run on-device OCR and persist the raw scan session output.

3. Add matching and human review
   Score OCR text against the starter catalog using player name, set name, and card number, then present uncertain matches for confirmation or correction.

4. Add full-page crop detection
   Detect individual cards from a page image, correct perspective, generate crop review UI, and feed those crops into the same OCR-plus-match pipeline.

5. Add post-confirmation pricing
   After a match is confirmed, call a pricing adapter to pull an approximate eBay-based value and store the resulting snapshot with the collection card.

6. Harden the local collection flow
   Build collection browsing and export, capture correction events, improve app settings, and test against real cards to trim failure cases before expanding scope.
