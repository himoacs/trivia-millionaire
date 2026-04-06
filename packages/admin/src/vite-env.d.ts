/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CLIENT_URL: string
  readonly VITE_SOLACE_URL: string
  readonly VITE_SOLACE_VPN: string
  readonly VITE_SOLACE_USERNAME: string
  readonly VITE_SOLACE_PASSWORD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
