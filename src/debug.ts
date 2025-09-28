let debugEnabled = false;
const originalDebug = console.debug.bind(console);

export function setDebugMode(enabled: boolean) {
  debugEnabled = enabled;
  if (enabled) {
    console.debug = originalDebug;
  } else {
    console.debug = () => {};
  }
}

export function isDebugMode(): boolean {
  return debugEnabled;
}
