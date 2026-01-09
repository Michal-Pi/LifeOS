/**
 * Error Message Utility
 *
 * Converts technical error messages into user-friendly messages.
 */

export interface UserFriendlyError {
  title: string
  description: string
}

/**
 * Convert an error to a user-friendly message
 * @param error Error object or error message string
 * @returns User-friendly error with title and description
 */
export function getUserFriendlyError(error: Error | string): UserFriendlyError {
  const message = typeof error === 'string' ? error : error.message
  const lowerMessage = message.toLowerCase()

  // Network/connection errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('networkerror')
  ) {
    return {
      title: 'Connection Error',
      description: 'Please check your internet connection and try again.',
    }
  }

  // Authentication/authorization errors
  if (
    lowerMessage.includes('permission') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('auth') ||
    lowerMessage.includes('token') ||
    lowerMessage.includes('authentication')
  ) {
    return {
      title: 'Permission Denied',
      description:
        "You don't have permission to perform this action. Please sign in again if the problem persists.",
    }
  }

  // Not found errors
  if (
    lowerMessage.includes('not found') ||
    lowerMessage.includes('404') ||
    lowerMessage.includes('does not exist')
  ) {
    return {
      title: 'Not Found',
      description: 'The requested item could not be found. It may have been deleted.',
    }
  }

  // Validation errors
  if (
    lowerMessage.includes('validation') ||
    lowerMessage.includes('invalid') ||
    lowerMessage.includes('required') ||
    lowerMessage.includes('missing')
  ) {
    return {
      title: 'Invalid Input',
      description:
        'Please check your input and try again. Some required fields may be missing or invalid.',
    }
  }

  // Rate limiting errors
  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('429')
  ) {
    return {
      title: 'Too Many Requests',
      description: 'You are making requests too quickly. Please wait a moment and try again.',
    }
  }

  // Server errors
  if (
    lowerMessage.includes('server error') ||
    lowerMessage.includes('500') ||
    lowerMessage.includes('internal server error') ||
    lowerMessage.includes('service unavailable') ||
    lowerMessage.includes('503')
  ) {
    return {
      title: 'Server Error',
      description: 'Our servers are experiencing issues. Please try again in a few moments.',
    }
  }

  // Timeout errors
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('request timeout')
  ) {
    return {
      title: 'Request Timeout',
      description: 'The request took too long to complete. Please try again.',
    }
  }

  // Quota/limit errors
  if (
    lowerMessage.includes('quota') ||
    lowerMessage.includes('limit exceeded') ||
    lowerMessage.includes('storage quota')
  ) {
    return {
      title: 'Storage Limit Reached',
      description: 'You have reached your storage limit. Please free up some space and try again.',
    }
  }

  // Sync/conflict errors
  if (
    lowerMessage.includes('conflict') ||
    lowerMessage.includes('sync') ||
    lowerMessage.includes('concurrent modification')
  ) {
    return {
      title: 'Sync Conflict',
      description: 'This item was modified elsewhere. Please refresh and try again.',
    }
  }

  // Default fallback
  return {
    title: 'Something went wrong',
    description:
      'An unexpected error occurred. Please try again. If the problem persists, contact support.',
  }
}
