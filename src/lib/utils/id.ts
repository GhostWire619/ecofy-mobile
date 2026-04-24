import * as Crypto from 'expo-crypto';

export function createId(prefix?: string) {
  const id = Crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}
