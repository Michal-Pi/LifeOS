import type { ModelSettings, ProviderModelConfig, ModelProvider } from '../domain/modelSettings'

export interface ModelSettingsRepository {
  /**
   * Get model settings for a user
   * Returns default settings if none exist
   */
  getSettings(userId: string): Promise<ModelSettings>
  
  /**
   * Update model settings for a user
   */
  updateSettings(settings: ModelSettings): Promise<void>
  
  /**
   * Update a specific provider's configuration
   */
  updateProviderConfig(
    userId: string,
    provider: ModelProvider,
    config: ProviderModelConfig
  ): Promise<void>
  
  /**
   * Reset settings to defaults
   */
  resetToDefaults(userId: string): Promise<void>
}
