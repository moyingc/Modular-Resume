'use client';

import { useState } from 'react';
import styles from './WelcomeGate.module.css';

type UiLocale = 'zh' | 'en';

function initialLocale(): UiLocale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('modular-resume-ui-locale');
  return stored === 'zh' ? 'zh' : 'en';
}

export default function WelcomeGate({ children }: { children: React.ReactNode }) {
  const [started, setStarted] = useState(false);
  const [locale, setLocale] = useState<UiLocale>(initialLocale);

  if (started) return <>{children}</>;

  const isZh = locale === 'zh';

  function chooseLocale(next: UiLocale) {
    setLocale(next);
    window.localStorage.setItem('modular-resume-ui-locale', next);
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  }

  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-label={isZh ? '欢迎使用模块化简历' : 'Welcome to Modular Resume'}>
        <div className={styles.languageSwitch}>
          <button className={locale === 'en' ? styles.active : ''} onClick={() => chooseLocale('en')}>English</button>
          <button className={locale === 'zh' ? styles.active : ''} onClick={() => chooseLocale('zh')}>中文</button>
        </div>

        <div className={styles.mark}>MR</div>
        <h1>{isZh ? '欢迎使用模块化简历' : 'Welcome to Modular Resume'}</h1>
        <p className={styles.author}>{isZh ? '作者：墨影' : 'Author: Moying'}</p>
        <a
          className={styles.github}
          href="https://github.com/moyingc"
          target="_blank"
          rel="noreferrer"
        >
          GitHub · moyingc
        </a>
        <button className={styles.start} onClick={() => setStarted(true)}>
          {isZh ? '开始使用' : 'Get Started'}
        </button>
        <p className={styles.copyright}>© 2026 {isZh ? '墨影' : 'Moying'}. {isZh ? '保留所有权利。' : 'All rights reserved.'}</p>
      </section>
    </main>
  );
}
