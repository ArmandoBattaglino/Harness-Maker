import pty from 'node-pty';
import os from 'os';

const shell = process.env.APPDATA + '\\npm\\gemini.cmd';
console.log('Spawning', shell);

const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env
});

ptyProcess.onData((data) => {
  process.stdout.write(data);
});

setTimeout(() => {
  console.log('\n--- Sending prompt ---');
  ptyProcess.write('Hello! Are you there?\r');
}, 5000);

setTimeout(() => {
  process.exit(0);
}, 15000);
