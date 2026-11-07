# Hollow Loop

An abstract idle loot hack-and-slash. Your glowing core fights geometric shapes floating in empty space.

Play it at https://alanhaag32-fn.github.io/hollow-loop/ and use Share → Add to Home Screen on iPhone to install it as an app.

## Working on it

The source is in `src/` (see [ARCHITECTURE.md](ARCHITECTURE.md)). The files at the repo root (`index.html`, `sw.js`,
`manifest.webmanifest`, icons) are build output, kept there because GitHub Pages serves the root.

```
npm install          # TypeScript (for checks) and Playwright (for tests)
npm run serve        # play src/ directly at http://localhost:8080
npm run build        # writes the Pages site to the root and dist/hollow-loop.html (the single-file game)
npm test             # static checks, then the behaviour tests in tests/
```
