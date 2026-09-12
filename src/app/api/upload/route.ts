import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { uploadToCloud, isCloudStorageEnabled } from '@/lib/file-storage';

export const maxDuration = 30;

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/upload
 * Accepts multipart/form-data with a "file" field.
 *
 * Storage strategy:
 *   1. If Supabase Storage is configured → upload to cloud, return public URL
 *   2. Fallback → save to local public/uploads/, return relative path
 *
 * Returns { url: "https://..." or "/uploads/...", filename, size, type }
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `File type "${file.type}" not allowed.` }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB` }, { status: 400 });
    }

    // Sanitize filename
    const ext = path.extname(file.name) || '.png';
    const baseName = file.name
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .substring(0, 50);
    const timestamp = Date.now();
    const safeFilename = `${timestamp}-${baseName}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;

    // ── Strategy 1: Supabase Storage (production) ──
    if (isCloudStorageEnabled()) {
      const storagePath = `uploads/${safeFilename}`;
      const cloudUrl = await uploadToCloud(buffer, storagePath, file.type);

      if (cloudUrl) {
        url = cloudUrl;
        console.log(`[Upload] Cloud: ${safeFilename} (${(file.size / 1024).toFixed(1)}KB) → ${url}`);
      } else {
        // Cloud failed, fall back to local
        console.warn('[Upload] Cloud upload failed, falling back to local');
        url = await saveLocal(buffer, safeFilename);
      }
    } else {
      // ── Strategy 2: Local disk (dev) ──
      url = await saveLocal(buffer, safeFilename);
    }

    return NextResponse.json({
      url,
      filename: safeFilename,
      originalName: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error: any) {
    console.error('[Upload] Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}

/** Save file to local public/uploads/ directory */
async function saveLocal(buffer: Buffer, filename: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`[Upload] Local: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
  return `/uploads/${filename}`;
}
