/**
 * File parsing utilities for the attachment system.
 * Extracts text content from various file formats:
 * - PDF  → pdf-parse v2 (PDFParse class)
 * - DOCX → mammoth
 * - DOC  → mammoth (best effort) or binary text extraction
 * - XLSX → xlsx (preserves table structure as markdown)
 * - TXT/MD/JSON → direct read
 */

import path from 'path';

export interface ParsedFile {
  extractedText: string;
  pageCount?: number;
  sheetNames?: string[];
}

/**
 * Parse a file buffer and extract text content based on MIME type.
 */
export async function parseFileContent(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParsedFile> {
  const ext = path.extname(fileName).toLowerCase();

  // PDF
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return parsePDF(buffer);
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return parseDOCX(buffer);
  }

  // DOC (legacy Word format)
  if (
    mimeType === 'application/msword' ||
    ext === '.doc'
  ) {
    return parseDOC(buffer, fileName);
  }

  // XLSX / XLS
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ext === '.xlsx' || ext === '.xls'
  ) {
    return parseXLSX(buffer);
  }

  // Plain text formats (txt, md, json, csv, yaml, etc.)
  if (
    mimeType.startsWith('text/') ||
    ext === '.txt' || ext === '.md' || ext === '.json' ||
    ext === '.csv' || ext === '.yaml' || ext === '.yml'
  ) {
    return { extractedText: buffer.toString('utf-8') };
  }

  // Unsupported format — return empty with note
  return {
    extractedText: `[不支持的文件格式: ${mimeType || ext}] 无法提取文本内容。`
  };
}

/**
 * PDF parsing using pdf-parse v2 API
 */
async function parsePDF(buffer: Buffer): Promise<ParsedFile> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return {
      extractedText: result.text || '[PDF 无文本内容]',
      pageCount: result.pages?.length,
    };
  } catch (err: any) {
    console.error('PDF parse error:', err.message);
    // Fallback: try to extract any readable text from the buffer
    const fallbackText = extractPlaintextFromBuffer(buffer);
    if (fallbackText && fallbackText.length > 50) {
      return { extractedText: `[PDF 解析降级模式]\n${fallbackText}` };
    }
    return { extractedText: `[PDF 解析失败: ${err.message}]` };
  }
}

/**
 * DOCX parsing using mammoth
 */
async function parseDOCX(buffer: Buffer): Promise<ParsedFile> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return {
      extractedText: result.value || '[DOCX 无文本内容]',
    };
  } catch (err: any) {
    console.error('DOCX parse error:', err.message);
    return { extractedText: `[DOCX 解析失败: ${err.message}]` };
  }
}

/**
 * DOC (legacy .doc) parsing
 * mammoth only supports DOCX. For .doc files:
 * 1. Try mammoth anyway (some .doc files are actually DOCX renamed)
 * 2. Fallback to raw text extraction from binary
 */
async function parseDOC(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  // Attempt 1: Try mammoth (works if the .doc is actually a DOCX in disguise)
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    if (result.value && result.value.trim().length > 20) {
      return { extractedText: result.value };
    }
  } catch {
    // Expected to fail for true .doc format
  }

  // Attempt 2: Extract readable text from the binary DOC file
  try {
    const text = extractTextFromDOC(buffer);
    if (text && text.length > 50) {
      return { extractedText: text };
    }
  } catch (err: any) {
    console.error('DOC binary parse error:', err.message);
  }

  return {
    extractedText: `[.doc 格式支持有限] 文件名: ${fileName}。建议将文件另存为 .docx 格式后重新上传，以获得完整的文本提取。`
  };
}

/**
 * Extract readable text from a legacy .doc binary file.
 * DOC files store text as UTF-16LE encoded strings within the binary.
 * This is a best-effort extraction.
 */
function extractTextFromDOC(buffer: Buffer): string {
  const chunks: string[] = [];
  
  // Strategy 1: UTF-16LE decoding (Word stores text this way in compound binary format)
  try {
    const utf16Text = buffer.toString('utf16le');
    // Extract contiguous Chinese/English text segments (min 10 chars)
    const chineseRegex = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u0020-\u007ea-zA-Z0-9\u{ff0c}\u{3002}\u{3001}\u{ff1b}\u{ff1a}\u{ff01}\u{ff1f}\u{ff08}\u{ff09}\u{300a}\u{300b}\u{201c}\u{201d}\u{2018}\u{2019}\u{3010}\u{3011}\-\n\r]{10,}/gu;
    const segments = utf16Text.match(chineseRegex);
    if (segments && segments.length > 0) {
      const clean = segments
        .map(s => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim())
        .filter(s => s.length > 10);
      if (clean.length > 0) {
        chunks.push(...clean);
      }
    }
  } catch {}

  // Strategy 2: UTF-8/ASCII extraction for English text
  if (chunks.length === 0) {
    try {
      const asciiText = buffer.toString('utf-8');
      const segments = asciiText.match(/[a-zA-Z0-9\s,.;:!?()\'\"@#$%&*\-+=]{20,}/g);
      if (segments) {
        const clean = segments
          .map(s => s.trim())
          .filter(s => s.length > 20 && /[a-zA-Z]/.test(s));
        chunks.push(...clean);
      }
    } catch {}
  }

  if (chunks.length === 0) return '';
  
  // Deduplicate and join
  const seen = new Set<string>();
  const unique = chunks.filter(c => {
    const key = c.substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.join('\n\n');
}

/**
 * XLSX parsing — preserves table structure as markdown
 */
async function parseXLSX(buffer: Buffer): Promise<ParsedFile> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    const sheetsText = sheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

      if (!jsonData || jsonData.length === 0) {
        return `### Sheet: ${name}\n[空表格]`;
      }

      const headers = (jsonData[0] as any[]).map(h => String(h ?? ''));
      const headerLine = '| ' + headers.join(' | ') + ' |';
      const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |';

      const rows = jsonData.slice(1).map(row => {
        const cells = (row as any[]).map(c => String(c ?? ''));
        while (cells.length < headers.length) cells.push('');
        return '| ' + cells.join(' | ') + ' |';
      });

      return `### Sheet: ${name}\n${headerLine}\n${separatorLine}\n${rows.join('\n')}`;
    });

    return {
      extractedText: sheetsText.join('\n\n'),
      sheetNames,
    };
  } catch (err: any) {
    console.error('XLSX parse error:', err.message);
    return { extractedText: `[XLSX 解析失败: ${err.message}]` };
  }
}

/**
 * Fallback: extract any printable text from a buffer
 */
function extractPlaintextFromBuffer(buffer: Buffer): string {
  try {
    const text = buffer.toString('utf-8');
    const segments = text.match(/[\u4e00-\u9fff\u3000-\u303fa-zA-Z0-9\s,.;:!?()\'\"]{20,}/g);
    return segments ? segments.join('\n') : '';
  } catch {
    return '';
  }
}
