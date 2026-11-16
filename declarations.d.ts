declare module 'pdfjs-dist/build/pdf.mjs';

// Minimal Vite env typing (project does not reference vite/client types).
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
