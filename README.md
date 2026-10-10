# Cosmic Daily

A static site for browsing NASA's [Astronomy Picture of the Day](https://apod.nasa.gov/), hosted on GitHub Pages at https://bunkersm.github.io/.

## Features

- Today's picture (or video), with title, credit and explanation
- Browse any date back to June 16, 1995: previous/next, date picker, random, and ← / → keys
- Shareable links (`?date=YYYY-MM-DD`)
- Gallery of the last two weeks
- Optional personal NASA API key (stored in your browser) to avoid the `DEMO_KEY` rate limit

## Files

- `index.html` – page structure
- `styles.css` – styling
- `app.js` – fetches from the [NASA APOD API](https://api.nasa.gov/) and renders the page

## Running locally

No build step. Serve the folder with any static server, for example:

```sh
npx http-server .
```
