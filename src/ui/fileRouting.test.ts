import { describe, expect, it } from 'vitest';
import { classifyFile } from './fileRouting';

describe('classifyFile', () => {
  it('route les fichiers de paroles par extension, quel que soit le type MIME', () => {
    expect(classifyFile('chanson.lrc', '')).toBe('lyrics');
    expect(classifyFile('Episode.SRT', 'application/x-subrip')).toBe('lyrics');
    expect(classifyFile('transcript.vtt', 'text/vtt')).toBe('lyrics');
  });

  it('route l’audio par type MIME ou extension', () => {
    expect(classifyFile('song.mp3', 'audio/mpeg')).toBe('audio');
    expect(classifyFile('01 - Piste.flac', '')).toBe('audio');
    expect(classifyFile('demo.wav', '')).toBe('audio');
    expect(classifyFile('livre.m4a', 'audio/mp4')).toBe('audio');
  });

  it('rejette le reste', () => {
    expect(classifyFile('photo.png', 'image/png')).toBe('unknown');
    expect(classifyFile('notes.txt', 'text/plain')).toBe('unknown');
  });
});
