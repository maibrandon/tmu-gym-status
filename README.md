# tmu-gym-status

A minimal, mobile-first website for checking occupancy across all six TMU gym spaces.

## Stack

React, TypeScript, Vite, and Tailwind CSS. Phase 1 is a static frontend with no backend, database, scheduled jobs, or shared cache.

## Local development

Use Node.js 22.22+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Readings load automatically and are also printed to the browser console. Refresh requests new readings; changing between Now and a future time does not trigger a fetch.

```sh
npm test
npm run build
npm run preview
```

## Live data

The browser fetches [TMU's Facility Occupancy page](https://recportal.torontomu.ca/FacilityOccupancy) with credentials omitted. TMU currently returns `Access-Control-Allow-Origin: *`; direct cross-origin access was verified in Chrome on September 9, 2026. If that policy changes, a small same-repository server function will be needed.

`src/occupancy.ts` parses a detached HTML document and reads each facility's displayed percentage. TMU's `data-occupancy` attribute is a headcount, not the displayed percentage. Duplicate desktop/mobile markup is read once. Missing or invalid readings are shown as unavailable, never as zero. A completely unrecognized response produces an error.

“Last checked” means when this app fetched the page, not when TMU measured occupancy. After five minutes, or a failed refresh, retained readings are marked as potentially outdated. There is no automatic polling. The local timer only updates the freshness label.

Future-time selection shows a coming-soon message. No predictions or busy/quiet thresholds are implemented.

## Validation

- TypeScript compilation and production build.
- Parser tests: displayed percentages vs headcounts, duplicate markup, source order, zero occupancy, missing/invalid readings, and unexpected pages.
- Chrome: real cross-origin fetch, all six readings, one initial source request, future-time selection without a source request, retained readings after failed refresh, and initial failure without invented values.
- Layout checked at 320, 390, 768, and 1440 pixels. Safari has not yet been tested.

## Deployment

The build output is `dist/`, with relative asset paths for static hosting. Vercel can use `npm run build` and `dist` as its output directory. GitHub Pages can publish the same directory through a deployment workflow. Deployment is not configured yet.

## Roadmap

1. **Live occupancy:** direct browser fetch, six facilities, responsive interface, future-time placeholder.
2. **Historical context:** manually collected dataset for typical occupancy by facility, weekday, and time, plus quieter alternatives where the data supports them.
3. **Shared caching:** retain the most recent source result for a few minutes across visitors. Historical collection can be automated later.

This is an unofficial student project, not affiliated with TMU. Source readings may lag behind conditions at the gym.
