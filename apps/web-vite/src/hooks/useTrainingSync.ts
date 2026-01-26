import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { startTrainingSyncWorker, stopTrainingSyncWorker } from '@/training/syncWorker'

export function useTrainingSync(): void {
  const { user } = useAuth()
  const userId = user?.uid

  useEffect(() => {
    if (userId) {
      startTrainingSyncWorker(userId)
    } else {
      stopTrainingSyncWorker()
    }
  }, [userId])
}
