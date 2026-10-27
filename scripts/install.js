import { spawnSync } from 'node:child_process';
// npm invokes this script with its own CLI path, avoiding Windows shell/symlink requirements.
for (const directory of ['server', 'client']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'install', '--prefix', directory, '--no-audit', '--no-fund'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
