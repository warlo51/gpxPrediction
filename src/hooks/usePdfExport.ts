import { useState } from 'react'
import type { RaceStrategyReport, RaceStrategyId } from '@/types/raceStrategy.types'

// ─── Sanitisation du nom de fichier ─────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\-_\u00C0-\u024F\s]/g, '_')
    .trim()
    .slice(0, 80)
    .concat('-strategie.pdf')
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePdfExport() {
  const [isGenerating, setIsGenerating] = useState(false)

  const exportPdf = async (report: RaceStrategyReport, activeStrategyId: RaceStrategyId) => {
    setIsGenerating(true)
    try {
      // Dynamic import — @react-pdf/renderer (~400KB gzip) chargé uniquement au clic
      const [{ pdf }, { StrategyPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/features/strategy/StrategyPdfDocument'),
      ])

      const element = StrategyPdfDocument({ report, activeStrategyId })
      const blob = await pdf(element).toBlob()

      const filename = sanitizeFilename(report.trackName)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsGenerating(false)
    }
  }

  return { exportPdf, isGenerating }
}
