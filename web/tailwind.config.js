// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1A5276', light: '#2E86C1', dark: '#154360' },
        health:{ DEFAULT: '#148F77', light: '#1ABC9C' },
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
    },
  },
  plugins: [],
}
