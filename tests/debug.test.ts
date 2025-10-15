import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDebugMode, setDebugMode } from '~/debug';

const nativeDebug = console.debug;
let disabledDebugFn: typeof console.debug;

beforeEach(() => {
  console.debug = nativeDebug;
  setDebugMode(false);
  disabledDebugFn = console.debug;
});

afterEach(() => {
  console.debug = nativeDebug;
  setDebugMode(false);
});

describe('debug mode helpers', () => {
  it('is disabled by default', () => {
    expect(isDebugMode()).toBe(false);
  });

  it('enables debug mode and restores logging capability', () => {
    setDebugMode(true);

    expect(isDebugMode()).toBe(true);
    expect(console.debug).not.toBe(disabledDebugFn);
  });

  it('replaces console.debug with a noop when disabled', () => {
    setDebugMode(true);
    setDebugMode(false);

    expect(isDebugMode()).toBe(false);
    expect(console.debug).not.toBe(nativeDebug);
    expect(console.debug()).toBeUndefined();
  });
});
