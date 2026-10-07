import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Snapshot } from '../store/useLingoStore';

export type RemoteBackup = {
  revision: number;
  snapshot: unknown;
  updatedAt: string;
};

const revisionKey = (userId: string) => `lingonest.cloud-revision.v1.${userId}`;

export async function readKnownRevision(userId: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(revisionKey(userId));
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function rememberRevision(userId: string, revision: number): Promise<void> {
  if (!Number.isSafeInteger(revision) || revision <= 0) throw new Error('Invalid cloud revision');
  await AsyncStorage.setItem(revisionKey(userId), String(revision));
}

/** A device may upload only when it knows the exact latest cloud revision. */
export function expectedUploadRevision(
  remoteRevision: number | null,
  knownRevision: number | null,
): number | null {
  if (remoteRevision === null) return 0;
  return remoteRevision === knownRevision ? remoteRevision : null;
}

export async function readRemoteBackup(
  client: SupabaseClient,
  userId: string,
): Promise<RemoteBackup | null> {
  const { data, error } = await client
    .from('user_backups')
    .select('revision,snapshot,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!Number.isSafeInteger(data.revision) || data.revision <= 0) {
    throw new Error('Invalid cloud revision');
  }
  return {
    revision: data.revision,
    snapshot: data.snapshot,
    updatedAt: data.updated_at,
  };
}

export async function uploadBackup(
  client: SupabaseClient,
  snapshot: Snapshot,
  expectedRevision: number,
): Promise<number> {
  const { data, error } = await client.rpc('save_lingonest_backup', {
    p_snapshot: snapshot,
    p_expected_revision: expectedRevision,
  });
  if (error) throw error;
  if (!Number.isSafeInteger(data) || data <= 0) throw new Error('Invalid cloud response');
  return data;
}
