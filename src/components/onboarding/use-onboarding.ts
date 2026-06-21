import { useCallback, useState } from 'react'

const STORAGE_KEY = 'luker-onboarding-complete'

function hasCompletedOnboarding() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

function markOnboardingComplete() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

export function useOnboarding() {
  const [show, setShow] = useState(() => !hasCompletedOnboarding())
  const complete = useCallback(() => {
    markOnboardingComplete()
    setShow(false)
  }, [])

  return { showOnboarding: show, completeOnboarding: complete }
}

