import Conf from 'conf';

/*****************************************************************************
 * Initialize the settings store.
 ****************************************************************************/
const settings = new Conf<Record<string, unknown>>({
  projectName: 'androidtv',
  configName: 'settings',
});

/*****************************************************************************
 * Sets a setting value by key.
 ****************************************************************************/
export const setSetting = (key: string, value: unknown): void => {
  settings.set(key, value);
};

/*****************************************************************************
 * Retrieves a setting value by key.
 ****************************************************************************/
export const getSetting = <T = unknown>(key: string, defaultValue?: T): T | undefined => {
  if (defaultValue !== undefined) {
    return settings.get(key, defaultValue) as T;
  }

  return settings.get(key) as T | undefined;
};

export default settings;
