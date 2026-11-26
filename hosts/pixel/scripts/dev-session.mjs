import { spawn } from 'node:child_process';

export async function runViewer(server, command, args) {
  let child;
  let forceStop;
  const stop = signal => {
    if (!child || forceStop) return;
    child.kill(signal);
    forceStop = setTimeout(() => child.kill('SIGKILL'), 4000);
    forceStop.unref();
  };
  const handlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => stop(signal)]));
  try {
    child = spawn(command, args, { stdio: 'inherit' });
    for (const [signal, handler] of handlers) process.on(signal, handler);
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  } finally {
    clearTimeout(forceStop);
    for (const [signal, handler] of handlers) process.off(signal, handler);
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
