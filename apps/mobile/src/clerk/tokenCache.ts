import * as SecureStore from "expo-secure-store";

/**
 * Clerk token cache for Expo (SecureStore-backed).
 * Prevents losing sessions between app restarts.
 */
export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore write errors; Clerk will still work in-memory
    }
  }
};

