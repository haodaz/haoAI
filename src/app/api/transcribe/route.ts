import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 25MB is the API limit; stay under it
const MAX_BYTES = 24 * 1024 * 1024;
const PRIMARY_MODEL = 'gpt-4o-mini-transcribe';
const FALLBACK_MODEL = 'whisper-1';

/**
 * POST /api/transcribe  (multipart: audio=<blob>, prompt?=<string>)
 * Speech → text for the voice-input buttons. Returns { text }.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Voice input is not configured (OPENAI_API_KEY missing)' }, { status: 503 });
    }

    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: 'No audio received' }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Recording is too long' }, { status: 413 });
    }

    const client = new OpenAI({ apiKey });
    const prompt = typeof form.get('prompt') === 'string' ? (form.get('prompt') as string).slice(0, 500) : undefined;

    const transcribe = (model: string) =>
      client.audio.transcriptions.create({ file: audio, model, prompt });

    let text = '';
    try {
      text = (await transcribe(PRIMARY_MODEL)).text;
    } catch (err: any) {
      console.warn(`[Transcribe] ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, err?.message);
      text = (await transcribe(FALLBACK_MODEL)).text;
    }

    return NextResponse.json({ text: text.trim() });
  } catch (error: any) {
    console.error('[Transcribe] error:', error);
    const status = error?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: error?.message || 'Transcription failed' }, { status });
  }
}
