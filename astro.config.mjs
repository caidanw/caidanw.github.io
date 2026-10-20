// @ts-check
import { defineConfig } from 'astro/config'

const selectedTheme = 'vitesse-dark'
// import selectedTheme from './src/themes/neo-tokyo.js'

// https://astro.build/config
export default defineConfig({
  site: 'https://caidan.dev',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: {
      theme: selectedTheme,
    },
  },
})
