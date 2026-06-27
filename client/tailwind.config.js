export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}', './index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        studio: {
          ink: '#0f172a',
          panel: '#111827',
          panel2: '#0f766e',
          line: '#e5e7eb',
          mint: '#14b8a6',
          coral: '#f97316',
          gold: '#f59e0b',
          sky: '#0ea5e9',
          violet: '#7c3aed'
        }
      }
    }
  },
  plugins: []
};
