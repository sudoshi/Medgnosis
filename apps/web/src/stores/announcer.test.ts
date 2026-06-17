import { describe, it, expect, beforeEach } from 'vitest';
import { useAnnouncerStore, announce } from './announcer.js';

describe('announcer', () => {
  beforeEach(() => useAnnouncerStore.setState({ polite: '', assertive: '' }));

  it('routes to the polite channel by default', () => {
    announce('Note saved');
    expect(useAnnouncerStore.getState().polite).toBe('Note saved');
    expect(useAnnouncerStore.getState().assertive).toBe('');
  });

  it('routes assertive messages to the assertive channel', () => {
    announce('New critical alert', { assertive: true });
    expect(useAnnouncerStore.getState().assertive).toContain('New critical alert');
    expect(useAnnouncerStore.getState().polite).toBe('');
  });

  it('re-announces an identical message by changing the text', () => {
    announce('Note saved');
    const first = useAnnouncerStore.getState().polite;
    announce('Note saved');
    const second = useAnnouncerStore.getState().polite;
    expect(second).not.toBe(first); // text must change so SR re-reads
    expect(second.replace(/\u200B/g, '')).toBe('Note saved'); // ...but reads the same words
  });
});
