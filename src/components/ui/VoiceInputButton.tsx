'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Square, Loader2 } from 'lucide-react';
import { message } from 'antd';

interface VoiceInputButtonProps {
  /** Called with the transcribed text once recording stops. */
  onTranscript: (text: string) => void;
  /** Optional context (e.g. current field text) to help the model with names and jargon. */
  prompt?: string;
  className?: string;
  /** Visual size of the icon. */
  size?: 'sm' | 'md';
  /** Optional text shown next to the icon (idle state only). */
  label?: string;
  /**
   * Show a one-time coach mark pointing at this button. The key identifies the
   * screen, so each screen introduces voice input once per browser.
   */
  hintKey?: string;
}

/** Bump the suffix to re-introduce the hint after a change. */
const HINT_STORAGE_PREFIX = 'bep_voice_hint_v1:';
const HINT_TEXT = 'Try speaking instead';

/** Auto-stop guard so a forgotten recording can't grow past the upload limit. */
const MAX_RECORDING_MS = 60 * 1000;

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return undefined;
  return candidates.find(type => MediaRecorder.isTypeSupported?.(type));
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'wav';
}

/**
 * Records from the microphone and writes the transcription into the field.
 * Uses MediaRecorder + /api/transcribe (OpenAI), so it works in every modern
 * browser rather than only Chrome's built-in speech recognition.
 */
export default function VoiceInputButton({ onTranscript, prompt, className = '', size = 'md', label, hintKey }: VoiceInputButtonProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hint, setHint] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const dismissHint = useCallback(() => {
    setHint(null);
    if (hintKey) {
      try { localStorage.setItem(HINT_STORAGE_PREFIX + hintKey, '1'); } catch { /* private mode */ }
    }
  }, [hintKey]);

  // One-time coach mark: point at the button the first time this screen is opened
  useEffect(() => {
    if (!hintKey) return;
    try {
      if (localStorage.getItem(HINT_STORAGE_PREFIX + hintKey)) return;
    } catch { return; }

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const below = rect.top < 90;
      setHint({ top: below ? rect.bottom + 10 : rect.top - 10, left: rect.left + rect.width / 2, below });
    };

    const showTimer = setTimeout(place, 700);
    const hideTimer = setTimeout(() => dismissHint(), 15000);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [hintKey, dismissHint]);

  const cleanup = useCallback(() => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setSeconds(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const transcribe = useCallback(async (blob: Blob, mimeType: string) => {
    setState('transcribing');
    try {
      const form = new FormData();
      form.append('audio', blob, `recording.${extensionFor(mimeType)}`);
      if (promptRef.current) form.append('prompt', promptRef.current);

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Transcription failed (${res.status})`);

      const text = (data.text || '').trim();
      if (!text) {
        message.info('No speech detected');
      } else {
        onTranscript(text);
      }
    } catch (err: any) {
      message.error(err.message || 'Transcription failed');
    } finally {
      setState('idle');
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    dismissHint();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      message.error('This browser does not support audio recording');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        if (blob.size < 1200) {
          setState('idle');
          message.info('Recording too short');
          return;
        }
        transcribe(blob, type);
      };
      recorder.onerror = () => {
        cleanup();
        setState('idle');
        message.error('Recording failed');
      };

      recorder.start();
      setState('recording');
      setSeconds(0);
      tickRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      stopTimerRef.current = setTimeout(() => {
        message.info('Recording stopped after 60 seconds');
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch (err: any) {
      cleanup();
      setState('idle');
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      message.error(
        denied
          ? 'Microphone access was blocked. Allow it for this site in your browser settings.'
          : err?.name === 'NotFoundError'
            ? 'No microphone found'
            : err?.message || 'Could not start recording',
      );
    }
  }, [cleanup, stopRecording, transcribe, dismissHint]);

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <>
    <button
      ref={buttonRef}
      type="button"
      onClick={() => (state === 'recording' ? stopRecording() : state === 'idle' ? startRecording() : undefined)}
      disabled={state === 'transcribing'}
      className={`relative flex items-center gap-1.5 justify-center transition-all duration-200 shrink-0 ${
        state === 'recording' ? 'text-red-600' : state === 'transcribing' ? 'text-indigo-500' : 'text-gray-500 hover:text-indigo-600'
      } ${className}`}
      title={state === 'recording' ? 'Stop and transcribe' : state === 'transcribing' ? 'Transcribing…' : 'Voice input'}
      aria-label={state === 'recording' ? 'Stop recording' : 'Start voice input'}
    >
      {state === 'recording' ? (
        <>
          <span className="relative flex items-center justify-center">
            <Square className={`${iconSize} fill-current`} />
            <span className="absolute inset-[-5px] rounded-full border-2 border-red-400 animate-ping opacity-30" />
          </span>
          <span className={`text-[11px] font-bold tabular-nums ${seconds >= 50 ? 'animate-pulse' : ''}`}>
            0:{String(seconds).padStart(2, '0')}
          </span>
        </>
      ) : state === 'transcribing' ? (
        <>
          <Loader2 className={`${iconSize} animate-spin`} />
          {label && <span className="text-[11px] font-bold">Transcribing…</span>}
        </>
      ) : (
        <>
          <Mic className={iconSize} />
          {label && <span className="text-[11px] font-bold">{label}</span>}
        </>
      )}
    </button>

    {hint && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed z-[2000] voice-hint-in"
        style={{ top: hint.top, left: hint.left, transform: `translate(-50%, ${hint.below ? '0' : '-100%'})` }}
        role="status"
      >
        <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
          <Mic className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">{HINT_TEXT}</span>
          <button type="button" onClick={dismissHint} className="ml-1 text-[11px] font-bold text-indigo-100 hover:text-white underline underline-offset-2">
            Got it
          </button>
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-indigo-600 rotate-45 ${hint.below ? '-top-1' : '-bottom-1'}`}
          />
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
