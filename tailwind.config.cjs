const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,ts,svelte}'],
  theme: {
    fontFamily: {
      sans: ['Inter Variable', ...defaultTheme.fontFamily.sans]
    },
    extend: {},
  },
  plugins: [],
}
