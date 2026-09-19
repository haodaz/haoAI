'use client';

import React from 'react';
import VoiceInputButton from './VoiceInputButton';

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Called with value + transcript; defaults to appending the transcript. */
  onTranscript?: (text: string) => void;
  wrapperClassName?: string;
};

/**
 * Textarea with a microphone button in its bottom-right corner.
 * Speech is transcribed and appended to whatever is already typed.
 */
export default function VoiceTextarea({ value, onChange, onTranscript, wrapperClassName = '', className = '', ...rest }: Props) {
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
          size="sm"
          className="p-1.5 rounded-lg bg-white/90 border border-gray-200 hover:border-gray-300 shadow-sm"
        />
      </div>
    </div>
  );
}
