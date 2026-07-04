import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('arrondit sous la minute', () => {
    expect(formatDuration(30)).toBe('<1 min');
    expect(formatDuration(-5)).toBe('<1 min');
  });

  it('minutes seules sous l\'heure', () => {
    expect(formatDuration(45 * 60)).toBe('45 min');
  });

  it('heures et minutes sur deux chiffres', () => {
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3960)).toBe('1 h 06');
  });

  it('jours et heures au-delà de 24 h', () => {
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2 d 4 h');
    expect(formatDuration(3 * 86400)).toBe('3 d');
  });
});
