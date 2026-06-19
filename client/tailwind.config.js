export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}', './index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        studio: {
          ink: '#111827',
          panel: '#172033',
          line: '#e5e7eb',
          mint: '#14b8a6',
          coral: '#f97316'
        }
      }
    }
  },
  plugins: []
};
