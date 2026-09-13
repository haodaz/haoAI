'use client';

import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n/config';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Force English language
    i18n.changeLanguage('en');
    localStorage.setItem('bristh_lang', 'en');
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
