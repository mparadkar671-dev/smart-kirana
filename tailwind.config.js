/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kirana: {
          primary: '#1e3a8a', // deep navy
          secondary: '#f97316', // bright saffron / orange
          surface: '#f8fafc',
          card: '#ffffff',
          dark: '#0f172a',
        },
        // Strict SRS semantic color tokens
        semantic: {
          red: '#dc2626', // Crimson Red: "You Will Get / Udhari Pending"
          green: '#16a34a', // Emerald Green: "Jama / Payment Received"
          amber: '#d97706',
        }
      }
    },
  },
  plugins: [],
}

