const defaultTheme = require('tailwindcss/defaultTheme');
const defaultColors = require('tailwindcss/colors');

let colors = {
	// Source color palletes
	surface: defaultColors.neutral,
	accent: defaultColors.emerald
};

// Semantic color tokens from the pallete
colors = {
	light: colors.surface[200],
	dark: colors.surface[900],
	...colors
};

/** @type {import('tailwindcss').Config}*/
const config = {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		fontFamily: {
			sans: ['Inter Variable', ...defaultTheme.fontFamily.sans],
			serif: defaultTheme.fontFamily.serif,
			mono: ['Source Code Pro Variable', ...defaultTheme.fontFamily.mono]
		},
		extend: {
			colors
		}
	},

	plugins: [require('@tailwindcss/typography')]
};

module.exports = config;
