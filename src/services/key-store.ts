import * as SecureStore from 'expo-secure-store';
export async function readSecret(key: string): Promise<string | null> { return SecureStore.getItemAsync(key); }
export async function writeSecret(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
