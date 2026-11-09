const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

function createVoiceWorker(python, script, args) {
  let child;
  let pending;
  let idle;

  function finish(error) {
    if (!pending) return;
    const { timer, resolve, reject } = pending;
    pending = undefined;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve();
  }

  function stop() {
    clearTimeout(idle);
    const process = child;
    child = undefined;
    process?.stdin.destroy();
    process?.kill();
    finish(new Error('El motor de voz se detuvo.'));
  }

  function start() {
    const process = spawn(python, ['-X', 'utf8', script, ...args], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const disconnected = () => { if (child === process) stop(); };
    process.once('error', disconnected);
    process.once('exit', disconnected);
    process.stdin.on('error', disconnected);
    createInterface({ input: process.stdout }).on('line', (line) => {
      if (child !== process || !pending) return;
      if (line === 'VRM_ERROR') stop();
      if (line === 'VRM_OK') {
        finish();
        idle = setTimeout(stop, 120_000);
      }
    });
    return process;
  }

  function speak(text, tone, output, control, reference) {
    if (pending) throw new Error('Ya hay una solicitud de voz en curso.');
    clearTimeout(idle);
    child ??= start();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject, timer: setTimeout(stop, 100_000) };
      child.stdin.write(JSON.stringify({ text, tone, output, control, reference }) + '\n');
    });
  }

  return { speak, stop };
}

module.exports = { createVoiceWorker };
