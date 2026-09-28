export type AtsSeverity = 'pass' | 'warning' | 'fail' | 'info';
export interface AtsCheck { id: string; label: string; severity: AtsSeverity; message: string; }
export interface PdfIntegrityReport { status: 'not-run' | 'unavailable' | 'pass' | 'warning' | 'fail'; pageCount: number; textLength: number; expectedTextLength: number; coverage: number | null; message: string; }
export interface AtsReport { score: number; risk: 'low' | 'medium' | 'high'; checks: AtsCheck[]; pdfIntegrity: PdfIntegrityReport; }
