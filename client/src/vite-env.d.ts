/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_MAX_UPLOAD_MB?: string;
  readonly VITE_MAX_IMPORT_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
