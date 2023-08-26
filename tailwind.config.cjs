const defaultTheme = require('tailwindcss/defaultTheme');
const defaultColors = require('tailwindcss/colors');

console.log(defaultColors);

// const colors = {
// 	surface: defaultColors.zinc,

// 	get light() {
// 		return this.surface[50];
// 	},
// 	get dark() {
// 		return this.surface[900];
//   }
// };

let colors = {
	// Source color palletes
	surface: defaultColors.zinc
};

// Semantic color tokens from the pallete
colors = {
	light: colors.surface[50],
	dark: colors.surface[900],
	...colors
};

/** @type {import('tailwindcss').Config} */
const config = {
	content: ['./src/**/*.{html,js,ts,svelte}'],
	theme: {
		fontFamily: {
			sans: ['Inter Variable', ...defaultTheme.fontFamily.sans]
		},
		extend: {
			colors
		}
	},
	plugins: []
};

module.exports = config;
