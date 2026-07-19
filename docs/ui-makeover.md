# UI Makeover Notes

The current UI is placeholder-grade — functional, but nothing here should ship as-is.

## Observations

- `src/app/page.tsx`: raw sign-in/sign-out buttons and unstyled `<Link>`s dumped in a flex column, no layout hierarchy or branding.
- `src/components/ui/` only has `button.tsx` and `sonner.tsx` — no card, input, dialog, nav, or empty-state primitives, so every page reinvents its own markup.
- No shared nav/header — `/`, `/l`, and `/u` each stand alone with no way to move between them except a raw link.
- No loading/empty/error states visible in `src/app/l` or `src/app/u` beyond the "janky progress indicator" mentioned in recent commits.

## Suggested Direction

1. Pull in a small set of shared primitives (card, input, nav bar, toast already via sonner) so pages stop hand-rolling markup.
2. Add a persistent header/nav across `/`, `/l` (library), and `/u` (upload) instead of bare links on the home page.
3. Replace the ad-hoc progress indicator in the upload flow with a proper determinate/indeterminate progress component tied to the async processing state.
4. Establish a real visual identity (type scale, spacing scale, one accent color) instead of default Tailwind grays.

This is scoped as a future pass — not blocking current async-processing work.
