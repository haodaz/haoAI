import React from 'react';
import prisma from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import path from 'path';
import fs from 'fs';
import { marked } from 'marked';

// Import parsers conditionally/dynamically if needed, but since it's server side, standard import is fine.
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

export default async function PreviewPage({ params }: { params: { id: string } }) {
  const item = await prisma.knowledgeItem.findUnique({
    where: { id: params.id }
  });

  if (!item) {
    notFound();
  }

  let htmlContent = '';
  let isPdf = false;
  let isImage = false;
  let isUnsupported = false;
  let rawText = '';

  const ext = item.fileName ? path.extname(item.fileName).toLowerCase() : '';
  
  if (item.fileUrl) {
    if (ext === '.pdf' || item.fileType === 'application/pdf') {
      isPdf = true;
    } else if (ext.match(/\.(jpg|jpeg|png|gif|webp)$/i) || item.fileType?.includes('image')) {
      isImage = true;
    } else {
      try {
        let buffer: Buffer;
        if (item.fileUrl.startsWith('http')) {
          const res = await fetch(item.fileUrl);
          const arrayBuffer = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } else {
          // Local file
          const localPath = path.join(process.cwd(), 'public', item.fileUrl.split('?')[0]);
          buffer = fs.readFileSync(localPath);
        }

        if (ext === '.docx' || item.fileType?.includes('wordprocessingml')) {
          const result = await mammoth.convertToHtml({ buffer });
          htmlContent = result.value;
        } else if (ext === '.xls' || ext === '.xlsx' || ext === '.csv' || item.fileType?.includes('excel') || item.fileType?.includes('spreadsheet')) {
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          htmlContent = xlsx.utils.sheet_to_html(worksheet);
          // Add some basic styling to the generated table
          htmlContent = htmlContent.replace(/<table/g, '<table class="w-full text-left border-collapse"').replace(/<td/g, '<td class="border border-gray-200 p-2"').replace(/<th/g, '<th class="border border-gray-300 p-2 bg-gray-50"');
        } else if (ext === '.txt' || ext === '.md' || item.fileType?.includes('text')) {
          rawText = buffer.toString('utf-8');
          htmlContent = ext === '.md' ? await marked(rawText) : `<pre class="whitespace-pre-wrap font-sans">${rawText}</pre>`;
        } else {
          isUnsupported = true;
        }
      } catch (err) {
        console.error('Error parsing file:', err);
        isUnsupported = true;
      }
    }
  } else if (item.content) {
    // Manual text entry
    htmlContent = await marked(item.content);
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/AIkb/business" className="p-2 -ml-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-emerald-600" />
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">{item.title}</h1>
              {item.fileName && <p className="text-[10px] text-gray-400 mt-0.5">{item.fileName}</p>}
            </div>
          </div>
        </div>
        {item.fileUrl && (
          <a href={item.fileUrl} download={item.fileName || 'download'} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors">
            <Download className="w-3.5 h-3.5" />
            下载原文件
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative flex justify-center">
        {isPdf && item.fileUrl ? (
          <iframe src={item.fileUrl} className="w-full h-full border-none" title="PDF Preview" />
        ) : isImage && item.fileUrl ? (
          <div className="flex items-center justify-center w-full h-full bg-gray-900/5 p-8 overflow-auto">
            <img src={item.fileUrl} alt={item.fileName || 'Preview'} className="max-w-full max-h-full object-contain shadow-sm border border-gray-200" />
          </div>
        ) : isUnsupported ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FileText className="w-16 h-16 mb-4 text-gray-300" />
            <h3 className="text-lg font-bold text-gray-600 mb-2">暂不支持该格式的在线预览</h3>
            <p className="text-sm mb-6">请点击右上角按钮下载文件后使用本地软件查看</p>
          </div>
        ) : (
          <div className="w-full max-w-5xl h-full overflow-y-auto bg-white shadow-xl border-x border-gray-100">
            <div className="p-10 md:p-16 markdown-body" dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        )}
      </div>
    </div>
  );
}
