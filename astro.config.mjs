// @ts-check
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

const selectedTheme = 'vitesse-dark'
// import selectedTheme from './src/themes/neo-tokyo.js'

// https://astro.build/config
export default defineConfig({
  site: 'https://caidan.dev',
  trailingSlash: 'always',
  // Astro 7 defaults to JSX-style whitespace stripping ('jsx'), which collapses
  // spaces between inline elements. Keep the HTML-aware behavior from v6.
  compressHTML: true,
  integrations: [
    // Lab pages are unlisted (noindex); drafts are never emitted as routes.
    sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/lab/') }),
  ],
  markdown: {
    shikiConfig: {
      theme: selectedTheme,
    },
  },
})
