/**
 * Supabase Storage client for file uploads.
 * Uses the service_role key (server-side only) to bypass RLS.
 * Falls back to local disk storage if Supabase is not configured.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Bucket name for task attachments
export const STORAGE_BUCKET = 'task-attachments';

let _client: SupabaseClient | null = null;

/**
 * Get the Supabase admin client (with service_role key).
 * Returns null if Supabase Storage is not configured.
 */
export function getStorageClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null;
  }
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/**
 * Check if Supabase Storage is available.
 */
export function isCloudStorageEnabled(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_SERVICE_KEY;
}

/**
 * Upload a file to Supabase Storage.
 * @returns The public URL of the uploaded file, or null on failure.
 */
export async function uploadToCloud(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<string | null> {
  const client = getStorageClient();
  if (!client) return null;

  try {
    // Ensure bucket exists (idempotent)
    await ensureBucket(client);

    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error('[Storage] Upload error:', error.message);
      return null;
    }

    // Get public URL
    const { data: urlData } = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return urlData.publicUrl || null;
  } catch (err: any) {
    console.error('[Storage] Upload failed:', err.message);
    return null;
  }
}

/**
 * Download a file from Supabase Storage.
 * @returns The file buffer, or null on failure.
 */
export async function downloadFromCloud(storagePath: string): Promise<Buffer | null> {
  const client = getStorageClient();
  if (!client) return null;

  try {
    const { data, error } = await client.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (error || !data) {
      console.error('[Storage] Download error:', error?.message);
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    console.error('[Storage] Download failed:', err.message);
    return null;
  }
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromCloud(storagePath: string): Promise<boolean> {
  const client = getStorageClient();
  if (!client) return false;

  try {
    const { error } = await client.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);
    return !error;
  } catch {
    return false;
  }
}

// Ensure the storage bucket exists (create if not)
let _bucketEnsured = false;
async function ensureBucket(client: SupabaseClient) {
  if (_bucketEnsured) return;
  try {
    const { data: buckets } = await client.storage.listBuckets();
    const exists = buckets?.some(b => b.name === STORAGE_BUCKET);
    if (!exists) {
      await client.storage.createBucket(STORAGE_BUCKET, {
        public: true,        // Files are publicly readable (for agent access)
        fileSizeLimit: 20 * 1024 * 1024, // 20MB
      });
      console.log(`[Storage] Created bucket: ${STORAGE_BUCKET}`);
    }
    _bucketEnsured = true;
  } catch (err: any) {
    console.warn('[Storage] Bucket check/create warning:', err.message);
    _bucketEnsured = true; // Don't retry on every upload
  }
}
