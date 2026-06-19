import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const clientDir = path.join(repoRoot, 'client');

const result = spawnSync('npm', ['run', 'build'], {
  cwd: clientDir,
  stdio: 'inherit',
  shell: true
});

process.exit(result.status ?? 1);
