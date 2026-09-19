'use client';

import React from 'react';
import VoiceInputButton from './VoiceInputButton';

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Called with value + transcript; defaults to appending the transcript. */
  onTranscript?: (text: string) => void;
  wrapperClassName?: string;
  /** Show the one-time "try speaking" coach mark for this screen. */
  hintKey?: string;
};

/**
 * Textarea with a microphone button in its bottom-right corner.
 * Speech is transcribed and appended to whatever is already typed.
 */
export default function VoiceTextarea({ value, onChange, onTranscript, wrapperClassName = '', className = '', hintKey, ...rest }: Props) {
  const appendTranscript = (text: string) => {
    if (onTranscript) return onTranscript(text);
    const next = value && !/\s$/.test(value) ? `${value} ${text}` : `${value || ''}${text}`;
    onChange({ target: { value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
  };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <textarea {...rest} value={value} onChange={onChange} className={`${className} pr-10`} />
      <div className="absolute bottom-2 right-2">
        <VoiceInputButton
          onTranscript={appendTranscript}
          prompt={value?.slice(-400)}
          hintKey={hintKey}
          className="h-8 min-w-8 px-2 rounded-lg bg-white border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 shadow-sm"
        />
      </div>
    </div>
  );
}
