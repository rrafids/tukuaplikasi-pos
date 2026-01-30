/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eef6f9',
          100: '#d6eaf1',
          200: '#b3dae5',
          300: '#80c4d5',
          400: '#4da8c2',
          500: '#1d8ba8',
          600: '#0B4F6C',
          700: '#094258',
          800: '#083648',
          900: '#062d3d',
        },
      },
    },
  },
  plugins: [],
};