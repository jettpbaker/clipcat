'use client'

import { scan } from 'react-scan' // must be before React imports
import { useEffect } from 'react'

export function ReactScan() {
  useEffect(() => {
    scan({ enabled: true })
  }, [])

  return null
}
