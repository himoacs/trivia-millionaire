/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SOLACE_BROKER_URL: string
  readonly VITE_SOLACE_VPN_NAME: string
  readonly VITE_SOLACE_USERNAME: string
  readonly VITE_SOLACE_PASSWORD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
