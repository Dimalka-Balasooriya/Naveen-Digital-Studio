import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const seen = new Set();
for (const key of Object.keys(process.env)) {
  const normalized = key.toLowerCase();
  if (seen.has(normalized)) {
    delete process.env[key];
  } else {
    seen.add(normalized);
  }
}

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});

await server.listen();
server.printUrls();
