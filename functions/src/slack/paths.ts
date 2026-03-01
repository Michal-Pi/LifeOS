/**
 * Firestore Path Utilities for Slack Integration
 *
 * Follows the same pattern as google/paths.ts for consistency.
 */

import { getFirestore, DocumentReference } from 'firebase-admin/firestore'

const db = () => getFirestore()

// ----- Slack Account Paths -----

/**
 * Public Slack account metadata (non-sensitive)
 * Path: users/{uid}/slackAccounts/{workspaceId}
 */
export function slackAccountRef(uid: string, workspaceId: string): DocumentReference {
  return db().doc(`users/${uid}/slackAccounts/${workspaceId}`)
}

/**
 * All Slack accounts for a user
 */
export function slackAccountsCollection(uid: string) {
  return db().collection(`users/${uid}/slackAccounts`)
}

/**
 * Private Slack credentials (tokens, secrets)
 * Path: users/{uid}/privateIntegrations/slack/slackAccounts/{workspaceId}
 */
export function privateSlackAccountRef(uid: string, workspaceId: string): DocumentReference {
  return db().doc(`users/${uid}/privateIntegrations/slack/slackAccounts/${workspaceId}`)
}

// ----- Slack Channel Paths -----

/**
 * Monitored channels for a workspace
 * Path: users/{uid}/slackAccounts/{workspaceId}/monitoredChannels/{channelId}
 */
export function monitoredChannelRef(
  uid: string,
  workspaceId: string,
  channelId: string
): DocumentReference {
  return db().doc(`users/${uid}/slackAccounts/${workspaceId}/monitoredChannels/${channelId}`)
}

/**
 * All monitored channels for a workspace
 */
export function monitoredChannelsCollection(uid: string, workspaceId: string) {
  return db().collection(`users/${uid}/slackAccounts/${workspaceId}/monitoredChannels`)
}

// ----- Prioritized Messages Paths -----

/**
 * Prioritized messages for mailbox
 * Path: users/{uid}/mailboxMessages/{messageId}
 */
export function prioritizedMessageRef(uid: string, messageId: string): DocumentReference {
  return db().doc(`users/${uid}/mailboxMessages/${messageId}`)
}

/**
 * All prioritized messages for a user
 */
export function prioritizedMessagesCollection(uid: string) {
  return db().collection(`users/${uid}/mailboxMessages`)
}

// ----- Mailbox Message Bodies Paths -----

/**
 * Full message body stored separately for offline reading
 * Path: users/{uid}/mailboxMessageBodies/{messageId}
 */
export function messageBodyRef(uid: string, messageId: string): DocumentReference {
  return db().doc(`users/${uid}/mailboxMessageBodies/${messageId}`)
}

/**
 * All message bodies for a user
 */
export function messageBodiesCollection(uid: string) {
  return db().collection(`users/${uid}/mailboxMessageBodies`)
}

// ----- Mailbox Sync Paths -----

/**
 * Mailbox sync records
 * Path: users/{uid}/mailboxSyncs/{syncId}
 */
export function mailboxSyncRef(uid: string, syncId: string): DocumentReference {
  return db().doc(`users/${uid}/mailboxSyncs/${syncId}`)
}

/**
 * All syncs for a user
 */
export function mailboxSyncsCollection(uid: string) {
  return db().collection(`users/${uid}/mailboxSyncs`)
}

// ----- Mailbox Settings Paths -----

/**
 * Mailbox settings for a user
 * Path: users/{uid}/settings/mailbox
 */
export function mailboxSettingsRef(uid: string): DocumentReference {
  return db().doc(`users/${uid}/settings/mailbox`)
}

// ----- Channel Connections Paths -----

/**
 * A specific channel connection document
 * Path: users/{uid}/channelConnections/{connectionId}
 */
export function channelConnectionRef(uid: string, connectionId: string): DocumentReference {
  return db().doc(`users/${uid}/channelConnections/${connectionId}`)
}

/**
 * All channel connections for a user
 */
export function channelConnectionsCollection(uid: string) {
  return db().collection(`users/${uid}/channelConnections`)
}

// ----- Mailbox Drafts Paths -----

/**
 * A specific draft document
 * Path: users/{uid}/mailboxDrafts/{draftId}
 */
export function mailboxDraftRef(uid: string, draftId: string): DocumentReference {
  return db().doc(`users/${uid}/mailboxDrafts/${draftId}`)
}

/**
 * All drafts for a user
 */
export function mailboxDraftsCollection(uid: string) {
  return db().collection(`users/${uid}/mailboxDrafts`)
}

// ----- OAuth State Paths -----

/**
 * Temporary OAuth state storage
 * Path: oauthState/slack/{nonce}
 */
export function slackOAuthStateRef(nonce: string): DocumentReference {
  return db().doc(`oauthState/slack/${nonce}`)
}

// ----- Slack App Settings Paths -----

/**
 * User's Slack App settings (Client ID, etc.)
 * Path: users/{uid}/integrations/slack
 */
export function slackAppSettingsRef(uid: string): DocumentReference {
  return db().doc(`users/${uid}/integrations/slack`)
}
