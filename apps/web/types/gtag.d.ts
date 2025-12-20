interface Window {
  gtag: (
    command: 'config' | 'event' | 'set',
    targetId: string,
    config?: any
  ) => void
  dataLayer: any[]
}