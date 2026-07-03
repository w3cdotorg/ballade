// Génère samples/demo.wav : 60 s de sinusoïde 440 Hz, PCM 16 bits mono 22 050 Hz.
// Permet de tester l'app sans MP3 sous droits.
import { mkdirSync, writeFileSync } from 'node:fs';

const rate = 22050;
const seconds = 60;
const n = rate * seconds;
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  const v = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.2 * 32767;
  data.writeInt16LE(Math.round(v), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
mkdirSync('samples', { recursive: true });
writeFileSync('samples/demo.wav', Buffer.concat([header, data]));
console.log('samples/demo.wav écrit (60 s).');
