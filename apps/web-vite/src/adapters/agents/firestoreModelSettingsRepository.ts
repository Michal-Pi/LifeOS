import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import type {
  ModelSettings,
  ModelSettingsRepository,
  ProviderModelConfig,
  ModelProvider,
} from '@lifeos/agents'
import { createDefaultModelSettings } from '@lifeos/agents'
import { getFirestoreClient } from '@/lib/firebase'

export class FirestoreModelSettingsRepository implements ModelSettingsRepository {
  private getDocRef(userId: string) {
    const db = getFirestoreClient()
    return doc(db, 'users', userId, 'settings', 'models')
  }

  async getSettings(userId: string): Promise<ModelSettings> {
    const docRef = this.getDocRef(userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return docSnap.data() as ModelSettings
    }

    // Create and save default settings
    const defaultSettings = createDefaultModelSettings(userId)
    await setDoc(docRef, defaultSettings)
    return defaultSettings
  }

  async updateSettings(settings: ModelSettings): Promise<void> {
    const docRef = this.getDocRef(settings.userId)
    const updatedSettings: ModelSettings = {
      ...settings,
      updatedAtMs: Date.now(),
    }
    await setDoc(docRef, updatedSettings)
  }

  async updateProviderConfig(
    userId: string,
    provider: ModelProvider,
    config: ProviderModelConfig
  ): Promise<void> {
    const docRef = this.getDocRef(userId)
    const updatedConfig: ProviderModelConfig = {
      ...config,
      lastUpdatedMs: Date.now(),
    }
    await updateDoc(docRef, {
      [`providers.${provider}`]: updatedConfig,
      updatedAtMs: Date.now(),
    })
  }

  async resetToDefaults(userId: string): Promise<void> {
    const defaultSettings = createDefaultModelSettings(userId)
    await this.updateSettings(defaultSettings)
  }
}
