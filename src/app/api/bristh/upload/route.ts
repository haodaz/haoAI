import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseFileContent } from '@/lib/file-parser';
import { uploadToCloud, isCloudStorageEnabled } from '@/lib/file-storage';

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // .xlsx
  'application/vnd.ms-excel',                                                // .xls
  'application/msword',                                                      // .doc
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

// Also allow by extension (browsers sometimes send generic MIME)
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xls',
  '.txt', '.md', '.json', '.csv', '.yaml', '.yml',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_FILES = 10;

export interface AttachmentMeta {
  id: string;
  originalName: string;
  storagePath: string;       // Cloud URL or local path
  storageType: 'cloud' | 'local';
  mimeType: string;
  size: number;
  extractedText: string;
  summary: string;
  pageCount?: number;
  sheetNames?: string[];
}

/**
 * POST /api/bristh/upload
 * 
 * Accepts multipart form data with files and an optional contextId.
 * - Stores files to Supabase Storage (preferred) or local disk (fallback)
 * - Parses each file to extract text content
 * - Returns attachment metadata array
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const contextId = (formData.get('contextId') as string) || `tmp_${Date.now()}`;
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '请上传至少一个文件' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `最多支持 ${MAX_FILES} 个文件` }, { status: 400 });
    }

    const useCloud = isCloudStorageEnabled();
    console.log(`[Upload] Storage mode: ${useCloud ? 'Supabase Cloud' : 'Local Disk'}`);

    // For local fallback, ensure directory exists
    if (!useCloud) {
      const contextDir = path.join(LOCAL_UPLOADS_DIR, contextId);
      fs.mkdirSync(contextDir, { recursive: true });
    }

    const attachments: AttachmentMeta[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          originalName: file.name,
          storagePath: '',
          storageType: 'local',
          mimeType: file.type,
          size: file.size,
          extractedText: '',
          summary: `[文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制]`,
        });
        continue;
      }

      // Validate file type
      if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
        attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          originalName: file.name,
          storagePath: '',
          storageType: 'local',
          mimeType: file.type,
          size: file.size,
          extractedText: '',
          summary: `[不支持的文件类型: ${file.type || ext}]`,
        });
        continue;
      }

      // Read file buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate unique attachment ID
      const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const safeFileName = `${attId}${ext}`;

      // Store file
      let storagePath = '';
      let storageType: 'cloud' | 'local' = 'local';

      if (useCloud) {
        // Upload to Supabase Storage
        const cloudPath = `${contextId}/${safeFileName}`;
        const publicUrl = await uploadToCloud(buffer, cloudPath, file.type || 'application/octet-stream');
        if (publicUrl) {
          storagePath = publicUrl;
          storageType = 'cloud';
        } else {
          // Fallback to local if cloud upload fails
          console.warn(`[Upload] Cloud upload failed for ${file.name}, falling back to local`);
          const localPath = path.join(LOCAL_UPLOADS_DIR, contextId);
          fs.mkdirSync(localPath, { recursive: true });
          fs.writeFileSync(path.join(localPath, safeFileName), buffer);
          storagePath = `/uploads/${contextId}/${safeFileName}`;
        }
      } else {
        // Local disk storage
        const localDir = path.join(LOCAL_UPLOADS_DIR, contextId);
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(localDir, safeFileName), buffer);
        storagePath = `/uploads/${contextId}/${safeFileName}`;
      }

      // Parse file content (always done, regardless of storage backend)
      const parsed = await parseFileContent(buffer, file.type, file.name);

      // Generate summary (first 200 chars of extracted text)
      const summaryText = parsed.extractedText
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
      const summary = summaryText
        ? summaryText + (parsed.extractedText.length > 200 ? '...' : '')
        : '[无法提取摘要]';

      attachments.push({
        id: attId,
        originalName: file.name,
        storagePath,
        storageType,
        mimeType: file.type || `application/${ext.replace('.', '')}`,
        size: file.size,
        extractedText: parsed.extractedText,
        summary,
        pageCount: parsed.pageCount,
        sheetNames: parsed.sheetNames,
      });
    }

    return NextResponse.json({
      success: true,
      contextId,
      storageMode: useCloud ? 'cloud' : 'local',
      attachments,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/bristh/upload?contextId=xxx
 * Returns the list of uploaded files for a given contextId (local only fallback).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contextId = searchParams.get('contextId');

    if (!contextId) {
      return NextResponse.json({ error: 'Missing contextId' }, { status: 400 });
    }

    const contextDir = path.join(LOCAL_UPLOADS_DIR, contextId);
    if (!fs.existsSync(contextDir)) {
      return NextResponse.json({ files: [] });
    }

    const files = fs.readdirSync(contextDir).map(f => {
      const stat = fs.statSync(path.join(contextDir, f));
      return {
        name: f,
        url: `/uploads/${contextId}/${f}`,
        size: stat.size,
      };
    });

    return NextResponse.json({ files });
  } catch (error: any) {
    console.error('Upload list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
