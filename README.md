# Transit Docs

Documentation site for [Transit](https://github.com/sabeeirsharrma/transit) — built with [Astro Starlight](https://starlight.astro.build/).

## Local Development

```bash
npm install
npm run dev
```

The site runs at `http://localhost:4321`.

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Structure

```
src/
  content/
    docs/
      index.mdx                    # Landing page
      guides/
        getting-started.mdx         # Setup walkthrough
        contributing.mdx            # Monorepo dev guide
      reference/
        api-reference.mdx           # Transit JS API
        architecture.mdx            # System design
        binary-protocol.mdx         # Wire format spec
        export-tiers.mdx            # Function discovery
  styles/
    custom.css                      # Gold/mustard theme overrides
```

## Theming

Colors are customized via CSS custom properties in `src/styles/custom.css`. Dark mode uses `html[data-theme="dark"]`.

## Deployment

Push to the `web` branch to trigger a GitHub Pages deploy via `.github/workflows/deploy.yml`.
