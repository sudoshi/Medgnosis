import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useThemeStore } from './theme.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  // jsdom has no matchMedia — stub it (default: OS prefers dark)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('dark'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
});

describe('theme store', () => {
  it('defaults to auto and resolves from prefers-color-scheme', () => {
    useThemeStore.getState().initFromStorage();
    expect(useThemeStore.getState().theme).toBe('auto');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme("light") persists and sets data-theme', () => {
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('mg_theme')).toBe('light');
  });

  it('toggleTheme flips resolved dark<->light and pins an explicit mode', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('initFromStorage restores a saved explicit theme', () => {
    localStorage.setItem('mg_theme', 'light');
    useThemeStore.getState().initFromStorage();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
  });

  it('setPalette keeps the current resolved theme and persists', () => {
    useThemeStore.getState().setTheme('light');
    useThemeStore.getState().setPalette('arctic');
    expect(useThemeStore.getState().paletteId).toBe('arctic');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(localStorage.getItem('mg_palette')).toBe('arctic');
  });
});
