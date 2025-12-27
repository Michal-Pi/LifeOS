/**
 * Structured logging utility
 * Provides consistent log levels and formatting across the application
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: Error | unknown, context?: LogContext): void
}

class ConsoleLogger implements Logger {
  namespace: string
  minLevel: LogLevel

  constructor(namespace: string, minLevel: LogLevel = 'info') {
    this.namespace = namespace
    this.minLevel = minLevel
  }

  shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }

  formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.namespace}]`
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `${prefix} ${message}${contextStr}`
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context))
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context))
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context))
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorContext =
        error instanceof Error
          ? { ...context, error: error.message, stack: error.stack }
          : { ...context, error }
      console.error(this.formatMessage('error', message, errorContext))
    }
  }
}

/**
 * Create a logger instance for a specific namespace
 * @param namespace - The namespace for this logger (e.g., 'Outbox', 'Sync', 'EventOperations')
 * @param minLevel - Minimum log level to output (default: 'info')
 */
export function createLogger(namespace: string, minLevel: LogLevel = 'info'): Logger {
  return new ConsoleLogger(namespace, minLevel)
}

/**
 * Set the global minimum log level
 * Can be overridden per-logger
 */
let globalMinLevel: LogLevel = 'info'

export function setGlobalLogLevel(level: LogLevel): void {
  globalMinLevel = level
}

export function getGlobalLogLevel(): LogLevel {
  return globalMinLevel
}
