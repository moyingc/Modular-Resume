'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';

import type { ResumeDocument } from '../core/resume/types';
import { buildResumeExportFileName } from '../core/resume/fileName';
import type { PageSettings, SectionLayoutMode } from '../types/editor-ui.types';
import ResumePdfDocument from './ResumePdfDocument';
import { registerPdfFonts, resumeNeedsCjkFont } from './pdfFonts';

type PdfState = {
  blob: Blob | null;
  url: string;
  pageCount: number;
  isRendering: boolean;
  error: string;
  syncedSignature: string;
  lastGeneratedAt: Date | null;
};

type GenerateResult = {
  blob: Blob;
  url: string;
  pageCount: number;
  signature: string;
};

type RenderSnapshot = {
  signature: string;
  resume: ResumeDocument;
  settings: PageSettings;
  sectionLayouts: Record<string, SectionLayoutMode>;
  fileName: string;
};

async function cjkFontAvailable() {
  try {
    const response = await fetch('/pdf-fonts/NotoSansSC-Regular.woff', {
      method: 'HEAD',
      cache: 'force-cache',
    });
    return response.ok;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function useResumePdf({
  resume,
  settings,
  sectionLayouts,
}: {
  resume: ResumeDocument;
  settings: PageSettings;
  sectionLayouts: Record<string, SectionLayoutMode>;
}) {
  const [state, setState] = useState<PdfState>({
    blob: null,
    url: '',
    pageCount: 0,
    isRendering: false,
    error: '',
    syncedSignature: '',
    lastGeneratedAt: null,
  });

  const activeUrlRef = useRef('');
  const blobRef = useRef<Blob | null>(null);
  const syncedSignatureRef = useRef('');
  const renderJobRef = useRef<{ signature: string; promise: Promise<GenerateResult> } | null>(null);

  const signature = useMemo(
    () => JSON.stringify({ resume, settings, sectionLayouts }),
    [resume, settings, sectionLayouts],
  );

  const fileName = useMemo(
    () => buildResumeExportFileName(resume, settings.exportFileName),
    [resume, settings.exportFileName],
  );

  const latestSnapshotRef = useRef<RenderSnapshot>({
    signature,
    resume,
    settings,
    sectionLayouts,
    fileName,
  });
  useLayoutEffect(() => {
    latestSnapshotRef.current = { signature, resume, settings, sectionLayouts, fileName };
  }, [signature, resume, settings, sectionLayouts, fileName]);

  const dirty = !state.blob || !state.syncedSignature || state.syncedSignature !== signature;

  const renderSnapshot = useCallback(async (snapshot: RenderSnapshot): Promise<GenerateResult> => {
    setState((current) => ({ ...current, isRendering: true, error: '' }));

    try {
      registerPdfFonts();
      if (resumeNeedsCjkFont(snapshot.resume)) {
        const available = await cjkFontAvailable();
        if (!available) {
          throw new Error('检测到中文简历，但 PDF 中文字体尚未初始化。请先运行：node src/scripts/setup-pdf-fonts.mjs');
        }
      }

      const instance = pdf(
        <ResumePdfDocument
          resume={snapshot.resume}
          settings={snapshot.settings}
          sectionLayouts={snapshot.sectionLayouts}
        />,
      );
      const blob = await instance.toBlob();

      let pageCount = 0;
      try {
        const bytes = await blob.arrayBuffer();
        const parsed = await PDFDocument.load(bytes);
        pageCount = parsed.getPageCount();
      } catch {
        // Page count is secondary to a usable PDF Blob.
      }

      // A render that completed after the editor moved to another signature is useful
      // only to its original caller. Never publish it as the current preview/export state.
      if (latestSnapshotRef.current.signature === snapshot.signature) {
        const newUrl = URL.createObjectURL(blob);
        const previousUrl = activeUrlRef.current;
        activeUrlRef.current = newUrl;
        blobRef.current = blob;
        syncedSignatureRef.current = snapshot.signature;
        setState((current) => ({
          ...current,
          blob,
          url: newUrl,
          pageCount,
          isRendering: false,
          error: '',
          syncedSignature: snapshot.signature,
          lastGeneratedAt: new Date(),
        }));
        if (previousUrl) window.setTimeout(() => URL.revokeObjectURL(previousUrl), 500);
        return { blob, url: newUrl, pageCount, signature: snapshot.signature };
      }

      return { blob, url: '', pageCount, signature: snapshot.signature };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF 生成失败。';
      if (latestSnapshotRef.current.signature === snapshot.signature) {
        setState((current) => ({ ...current, isRendering: false, error: message }));
      }
      throw error;
    }
  }, []);

  const generatePdf = useCallback(async (): Promise<GenerateResult> => {
    // Always resolve against the newest editor/settings snapshot at invocation time.
    while (true) {
      const snapshot = latestSnapshotRef.current;

      if (
        blobRef.current &&
        syncedSignatureRef.current === snapshot.signature &&
        activeUrlRef.current
      ) {
        return {
          blob: blobRef.current,
          url: activeUrlRef.current,
          pageCount: state.pageCount,
          signature: snapshot.signature,
        };
      }

      const active = renderJobRef.current;
      if (active) {
        if (active.signature === snapshot.signature) return active.promise;
        try {
          await active.promise;
        } catch {
          // The newer requested signature still gets its own attempt.
        }
        continue;
      }

      const task = renderSnapshot(snapshot).finally(() => {
        if (renderJobRef.current?.signature === snapshot.signature) renderJobRef.current = null;
        // If a stale render was intentionally not published, clear the spinner unless a
        // newer render has already taken ownership of it.
        if (!renderJobRef.current && latestSnapshotRef.current.signature !== snapshot.signature) {
          setState((current) => ({ ...current, isRendering: false }));
        }
      });
      renderJobRef.current = { signature: snapshot.signature, promise: task };
      return task;
    }
  }, [renderSnapshot, state.pageCount]);

  const download = useCallback(() => {
    const snapshot = latestSnapshotRef.current;
    if (!blobRef.current || syncedSignatureRef.current !== snapshot.signature) return false;
    downloadBlob(blobRef.current, snapshot.fileName);
    return true;
  }, []);

  const generateAndDownload = useCallback(async () => {
    try {
      // An edit can happen while a render is in flight. Re-check after every completed
      // job and only download bytes matching the latest signature.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await generatePdf();
        const latest = latestSnapshotRef.current;
        if (result.signature === latest.signature) {
          downloadBlob(result.blob, latest.fileName);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [generatePdf]);

  useEffect(
    () => () => {
      if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
    },
    [],
  );

  return {
    ...state,
    dirty,
    synced: !dirty,
    signature,
    fileName,
    generatePdf,
    download,
    generateAndDownload,
  };
}
