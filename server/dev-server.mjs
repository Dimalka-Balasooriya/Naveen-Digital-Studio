const seen = new Set();
for (const key of Object.keys(process.env)) {
  const normalized = key.toLowerCase();
  if (seen.has(normalized)) {
    delete process.env[key];
  } else {
    seen.add(normalized);
  }
}

await import('./src/server.js');
