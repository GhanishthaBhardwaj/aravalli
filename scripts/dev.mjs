// npm run dev: starts the API (port 3001) and the web app (port 5173) together, with prefixed output.
// Ctrl+C stops both. No extra dependency: this is just two child processes.
import { spawn } from 'node:child_process';

const apps = [
  { name: 'api', args: ['run', 'dev', '-w', '@aravalli/api'] },
  { name: 'web', args: ['run', 'dev', '-w', '@aravalli/web', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'] },
];

const children = apps.map(({ name, args }) => {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) out.write(`[${name}] ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${name}] exited with code ${code}; stopping the other process`);
      stop(code ?? 1);
    }
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log('Aravalli dev: web http://127.0.0.1:5173   api http://127.0.0.1:3001   docs http://127.0.0.1:3001/api/docs');
