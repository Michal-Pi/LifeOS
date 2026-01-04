import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from 'firebase/firestore'
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage'
import { createLogger } from '@lifeos/core'

const logger = createLogger('Firebase')

/**
 * Firebase configuration interface
 */
interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
  measurementId?: string
}

let app: FirebaseApp | null = null
let firestoreInstance: Firestore | null = null
let authInstance: Auth | null = null
let storageInstance: FirebaseStorage | null = null
let emulatorConnected = false
let authEmulatorConnected = false
let storageEmulatorConnected = false

// Cache for runtime-fetched config
let cachedConfig: FirebaseConfig | null = null
let configFetchPromise: Promise<FirebaseConfig> | null = null
const CONFIG_STORAGE_KEY = 'lifeos.firebaseConfig'

const loadStoredConfig = (): FirebaseConfig | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FirebaseConfig>
    if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId) {
      return null
    }
    return parsed as FirebaseConfig
  } catch {
    return null
  }
}

const persistConfig = (config: FirebaseConfig): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage errors (private mode, quota, etc).
  }
}

/**
 * Fetches Firebase config from Cloud Function at runtime.
 * This is the hybrid approach - config is served by Cloud Functions
 * which have access to Firebase secrets.
 *
 * Falls back to environment variables for local development.
 */
async function fetchFirebaseConfig(): Promise<FirebaseConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig as FirebaseConfig
  }

  // Return in-flight promise if already fetching
  if (configFetchPromise) {
    return configFetchPromise as Promise<FirebaseConfig>
  }

  // Start fetching config
  configFetchPromise = (async () => {
    logger.info('Fetching Firebase configuration')

    // First, try environment variables (for local development)
    // Vite exposes import.meta.env for environment variables
    const env = import.meta.env

    const envConfig = {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
    }

    // If we have env vars with all required keys, use them (local dev)
    if (envConfig.apiKey && envConfig.authDomain && envConfig.projectId) {
      logger.info('Using environment variables (local dev)')
      const config: FirebaseConfig = {
        apiKey: envConfig.apiKey,
        authDomain: envConfig.authDomain,
        projectId: envConfig.projectId,
        storageBucket: envConfig.storageBucket,
        messagingSenderId: envConfig.messagingSenderId,
        appId: envConfig.appId,
        measurementId: envConfig.measurementId
      }
      cachedConfig = config
      persistConfig(config)
      logger.info('Config loaded from env', {
        projectId: config.projectId,
        authDomain: config.authDomain
      })
      return config
    }

    const storedConfig = loadStoredConfig()
    if (storedConfig) {
      logger.info('Using cached Firebase config from storage')
      cachedConfig = storedConfig
      return storedConfig
    }

    // Otherwise, fetch from Cloud Function (production)
    try {
      // Determine the Cloud Function URL
      // In production, this will be your Firebase project's function URL
      const functionUrl = env.VITE_FIREBASE_FUNCTIONS_URL ||
        `https://us-central1-${envConfig.projectId || 'lifeos-pi'}.cloudfunctions.net/getFirebaseConfig`

      logger.info('Fetching from Cloud Function', { functionUrl })
      const response = await fetch(functionUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch Firebase config: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as Record<string, string | undefined>
      logger.info('Received config from Cloud Function', {
        projectId: data.projectId,
        authDomain: data.authDomain,
        hasApiKey: !!data.apiKey,
        hasAppId: !!data.appId
      })

      // Validate required fields
      if (!data.apiKey || !data.authDomain || !data.projectId) {
        logger.error('Invalid config - missing required fields', undefined, {
          hasApiKey: !!data.apiKey,
          hasAuthDomain: !!data.authDomain,
          hasProjectId: !!data.projectId
        })
        throw new Error('Invalid Firebase config received from Cloud Function')
      }

      const config: FirebaseConfig = {
        apiKey: data.apiKey,
        authDomain: data.authDomain,
        projectId: data.projectId,
        storageBucket: data.storageBucket,
        messagingSenderId: data.messagingSenderId,
        appId: data.appId,
        measurementId: data.measurementId
      }

      cachedConfig = config
      persistConfig(config)
      logger.info('Config cached successfully')
      return config
    } catch (error) {
      logger.error('Error fetching Firebase config', error)
      throw new Error(
        'Failed to load Firebase configuration. ' +
        'Make sure Cloud Functions are deployed or environment variables are set.'
      )
    }
  })()

  return configFetchPromise as Promise<FirebaseConfig>
}

/**
 * Get Firebase config (synchronous version for backward compatibility)
 * Returns null if config hasn't been fetched yet
 *
 * @deprecated Use fetchFirebaseConfig() for runtime config fetching
 */
function getFirebaseConfig(): FirebaseConfig | null {
  // If we have cached config, return it
  if (cachedConfig) {
    return cachedConfig as FirebaseConfig
  }

  // Try to get from environment variables (local dev)
  const env = import.meta.env

  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
  }

  // Check if required values are present
  const requiredKeys = ['apiKey', 'authDomain', 'projectId'] as const
  const missingRequired = requiredKeys.filter((key) => !config[key])

  if (missingRequired.length > 0) {
    const storedConfig = loadStoredConfig()
    if (storedConfig) {
      cachedConfig = storedConfig
      return storedConfig
    }
    return null
  }

  return config as FirebaseConfig
}

/**
 * Ensures Firebase app is initialized asynchronously.
 * This is the preferred initialization method for the hybrid architecture.
 *
 * @returns Promise that resolves to the initialized FirebaseApp
 */
async function ensureAppInitializedAsync(): Promise<FirebaseApp> {
  if (app) {
    return app
  }

  const config = await fetchFirebaseConfig()
  app = getApps().length ? getApps()[0] : initializeApp(config)
  return app
}

/**
 * Ensures Firebase app is initialized synchronously.
 * This is kept for backward compatibility but may return null
 * if config hasn't been fetched yet.
 *
 * @deprecated Use ensureAppInitializedAsync() instead
 */
function ensureAppInitialized(): FirebaseApp | null {
  if (app) {
    return app
  }

  const config = getFirebaseConfig()
  if (!config) {
    return null
  }

  app = getApps().length ? getApps()[0] : initializeApp(config)
  return app
}

/**
 * Initialize Firebase asynchronously by fetching configuration.
 * Call this early in your app lifecycle (e.g., in a root layout or provider).
 *
 * This function is idempotent - it's safe to call multiple times.
 *
 * @returns Promise that resolves when Firebase is initialized
 */
export async function initializeFirebase(): Promise<void> {
  logger.info('Starting Firebase initialization')
  const app = await ensureAppInitializedAsync()
  logger.info('Firebase initialized successfully', {
    projectId: app.options.projectId,
    authDomain: app.options.authDomain,
    appName: app.name
  })
}

/**
 * Get Firestore client instance
 */
export function getFirestoreClient(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance
  }

  const firebaseApp = ensureAppInitialized()
  if (!firebaseApp) {
    throw new Error(
      'Firebase is not initialized. ' +
      'Make sure to call initializeFirebase() before using Firestore.'
    )
  }

  // Initialize Firestore with the new cache API
  try {
    firestoreInstance = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    })
    logger.info('Firestore initialized with multi-tab persistence')
  } catch {
    // If already initialized (e.g., by another part of the app or HMR reload), use existing instance
    firestoreInstance = getFirestore(firebaseApp)
    // This is expected in development with HMR - no need to warn
    logger.debug('Firestore already initialized, using existing instance')
  }

  // Connect to emulator in development
  const env = import.meta.env
  if (env.VITE_USE_EMULATORS === 'true' && !emulatorConnected) {
    try {
      connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080)
      emulatorConnected = true
    } catch {
      // Emulator already connected
    }
  }

  return firestoreInstance
}

/**
 * Check if Firebase is available (with config)
 */
export function isFirebaseAvailable(): boolean {
  return getFirebaseConfig() !== null
}

/**
 * Get Firebase Auth instance
 * Returns the Auth instance for authentication operations
 */
export function getAuthClient(): Auth {
  if (authInstance) {
    return authInstance
  }

  const firebaseApp = ensureAppInitialized()
  if (!firebaseApp) {
    throw new Error(
      'Firebase is not initialized. ' +
      'Make sure to call initializeFirebase() before using Auth.'
    )
  }

  authInstance = getAuth(firebaseApp)

  // Connect to emulator in development
  const env = import.meta.env
  if (env.VITE_USE_EMULATORS === 'true' && !authEmulatorConnected) {
    try {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099')
      authEmulatorConnected = true
    } catch {
      // Emulator already connected
    }
  }

  return authInstance
}

/**
 * Get Firebase Storage instance
 * Returns the Storage instance for file operations
 */
export function getStorageClient(): FirebaseStorage {
  if (storageInstance) {
    return storageInstance
  }

  const firebaseApp = ensureAppInitialized()
  if (!firebaseApp) {
    throw new Error(
      'Firebase is not initialized. ' +
      'Make sure to call initializeFirebase() before using Storage.'
    )
  }

  storageInstance = getStorage(firebaseApp)

  // Connect to emulator in development
  const env = import.meta.env
  if (env.VITE_USE_EMULATORS === 'true' && !storageEmulatorConnected) {
    try {
      connectStorageEmulator(storageInstance, '127.0.0.1', 9199)
      storageEmulatorConnected = true
    } catch {
      // Emulator already connected
    }
  }

  return storageInstance
}

/**
 * Sign in with Google using popup
 */
export async function signInWithGoogle(): Promise<User> {
  logger.info('Starting Google sign-in process')

  try {
    const auth = getAuthClient()
    logger.info('Auth client obtained', {
      currentUser: auth.currentUser?.uid,
      appName: auth.app.name
    })

    const provider = new GoogleAuthProvider()
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly')
    provider.addScope('https://www.googleapis.com/auth/calendar.events')
    logger.info('GoogleAuthProvider created with calendar scopes')

    logger.info('Opening sign-in popup')
    const result = await signInWithPopup(auth, provider)

    logger.info('Sign-in successful', {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName
    })

    return result.user
  } catch (error: unknown) {
    let code = 'unknown'
    let message = 'An unknown error occurred'
    if (typeof error === 'object' && error !== null) {
      if ('code' in error) code = String((error as { code: string }).code)
      if ('message' in error) message = String((error as { message: string }).message)
    }
    logger.error('Sign-in failed', error, {
      code,
      message
    })
    throw error
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const auth = getAuthClient()
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

/**
 * Create a new user with email and password
 */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const auth = getAuthClient()
  const result = await createUserWithEmailAndPassword(auth, email, password)
  return result.user
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  try {
    const auth = getAuthClient()
    await firebaseSignOut(auth)
    logger.info('Sign-out complete')
  } catch (error) {
    logger.error('Sign-out error', error)
    throw error
  }
}

/**
 * Subscribe to auth state changes
 */
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  const auth = getAuthClient()
  return onAuthStateChanged(auth, callback)
}

// Re-export User type for convenience
export type { User }
