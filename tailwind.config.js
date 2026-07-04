/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gfast: {
          blue: '#1a56db',
          'blue-dark': '#1239a6',
          orange: '#f59e0b',
          green: '#16a34a',
          red: '#dc2626',
          g400: '#94a3b8',
          g500: '#64748b',
          g600: '#475569',
          'smoke-mid': '#e2e8f0',
        },
      },
      borderRadius: {
        '2lg': '14px',
      },
    },
  },
  plugins: [],
}
