// Added for Groupon Desk (fork of Paseo, Apache-2.0): the session and the vault key, in the keychain.
import * as SecureStore from "expo-secure-store";

/**
 * iOS keychain (Android keystore) items, readable only while the device is unlocked and never
 * synced to another device. The web build has no keychain: `secure-storage.web.ts`.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, OPTIONS);
}

export async function writeSecret(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, OPTIONS);
}

export async function deleteSecret(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, OPTIONS);
}
