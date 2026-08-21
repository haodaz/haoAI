import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { uploadToCloud, isCloudStorageEnabled } from '@/lib/file-storage';

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });
    }

    const useCloud = isCloudStorageEnabled();
    const ext = path.extname(file.name).toLowerCase();
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeFileName = `kb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    
    let storagePath = '';

    if (useCloud) {
      const cloudPath = `kb/${safeFileName}`;
      const publicUrl = await uploadToCloud(buffer, cloudPath, file.type || 'application/octet-stream');
      if (publicUrl) {
        storagePath = publicUrl;
      } else {
        // Fallback
        const localPath = path.join(LOCAL_UPLOADS_DIR, 'kb');
        fs.mkdirSync(localPath, { recursive: true });
        fs.writeFileSync(path.join(localPath, safeFileName), buffer);
        storagePath = `/uploads/kb/${safeFileName}`;
      }
    } else {
      const localPath = path.join(LOCAL_UPLOADS_DIR, 'kb');
      fs.mkdirSync(localPath, { recursive: true });
      fs.writeFileSync(path.join(localPath, safeFileName), buffer);
      storagePath = `/uploads/kb/${safeFileName}`;
    }

    return NextResponse.json({ 
      url: storagePath, 
      fileName: file.name, 
      fileType: file.type || ext,
      fileSize: file.size
    });
  } catch (error: any) {
    console.error('KB Upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
