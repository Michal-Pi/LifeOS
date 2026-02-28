/**
 * One-time Firestore cleanup script
 *
 * Deletes the old "workspaces" and "workspaceTemplates" subcollections
 * that were renamed to "workflows" and "workflowTemplates".
 *
 * Usage (run from the functions/ directory so firebase-admin is resolvable):
 *   cd functions && npx tsx ../scripts/purge-old-workspace-data.ts
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service-account key JSON, OR
 *   - Running in a Cloud Shell / environment with default credentials
 *   - firebase-admin installed (the functions/ package has it)
 */

import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialise Firebase Admin — uses ADC or GOOGLE_APPLICATION_CREDENTIALS
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (credPath) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serviceAccount = (await import(credPath, { with: { type: 'json' } }))
    .default as ServiceAccount
  initializeApp({ credential: cert(serviceAccount) })
} else {
  initializeApp()
}

const db = getFirestore()
const BATCH_SIZE = 400 // Firestore limit is 500 per batch

interface PurgeStats {
  users: number
  workspaceDocs: number
  runDocs: number
  deepResearchDocs: number
  workspaceTemplateDocs: number
  councilAnalyticsDocs: number
}

const stats: PurgeStats = {
  users: 0,
  workspaceDocs: 0,
  runDocs: 0,
  deepResearchDocs: 0,
  workspaceTemplateDocs: 0,
  councilAnalyticsDocs: 0,
}

async function deleteCollection(
  collectionPath: string,
  statKey: keyof PurgeStats
): Promise<number> {
  let deleted = 0
  let query = db.collection(collectionPath).limit(BATCH_SIZE)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await query.get()
    if (snapshot.empty) break

    const batch = db.batch()
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()
    deleted += snapshot.size
    stats[statKey] += snapshot.size

    if (snapshot.size < BATCH_SIZE) break
  }

  return deleted
}

async function purgeUserWorkspaces(userId: string): Promise<void> {
  const workspacesRef = db.collection(`users/${userId}/workspaces`)
  const workspaceSnap = await workspacesRef.listDocuments()

  for (const workspaceDoc of workspaceSnap) {
    const wId = workspaceDoc.id

    // Delete nested runs
    const runsDeleted = await deleteCollection(`users/${userId}/workspaces/${wId}/runs`, 'runDocs')
    if (runsDeleted > 0) {
      console.log(`  Deleted ${runsDeleted} runs from workspaces/${wId}`)
    }

    // Delete nested deepResearchRequests
    const drDeleted = await deleteCollection(
      `users/${userId}/workspaces/${wId}/deepResearchRequests`,
      'deepResearchDocs'
    )
    if (drDeleted > 0) {
      console.log(`  Deleted ${drDeleted} deepResearchRequests from workspaces/${wId}`)
    }

    // Delete the workspace document itself
    await workspaceDoc.delete()
    stats.workspaceDocs++
  }
}

async function purgeUserWorkspaceTemplates(userId: string): Promise<void> {
  await deleteCollection(`users/${userId}/workspaceTemplates`, 'workspaceTemplateDocs')
}

async function purgeCouncilAnalytics(userId: string): Promise<void> {
  // Council analytics docs were keyed by workspaceId — delete all of them
  // since new ones will be created with workflowId keys
  await deleteCollection(`users/${userId}/councilAnalytics`, 'councilAnalyticsDocs')
}

async function main(): Promise<void> {
  console.log('=== Purge Old Workspace Data ===\n')
  console.log('This script deletes the old "workspaces" and "workspaceTemplates" subcollections')
  console.log('that were renamed to "workflows" and "workflowTemplates".\n')

  // List all users
  const usersSnap = await db.collection('users').listDocuments()
  const userIds = usersSnap.map((doc) => doc.id)
  console.log(`Found ${userIds.length} users to process.\n`)

  for (const userId of userIds) {
    stats.users++
    console.log(`Processing user: ${userId}`)

    await purgeUserWorkspaces(userId)
    await purgeUserWorkspaceTemplates(userId)
    await purgeCouncilAnalytics(userId)
  }

  console.log('\n=== Purge Complete ===')
  console.log(`Users processed:            ${stats.users}`)
  console.log(`Workspace docs deleted:     ${stats.workspaceDocs}`)
  console.log(`Run docs deleted:           ${stats.runDocs}`)
  console.log(`DeepResearch docs deleted:  ${stats.deepResearchDocs}`)
  console.log(`Template docs deleted:      ${stats.workspaceTemplateDocs}`)
  console.log(`Analytics docs deleted:     ${stats.councilAnalyticsDocs}`)
  console.log(
    `Total docs deleted:         ${stats.workspaceDocs + stats.runDocs + stats.deepResearchDocs + stats.workspaceTemplateDocs + stats.councilAnalyticsDocs}`
  )
}

main().catch((err) => {
  console.error('Purge failed:', err)
  process.exit(1)
})
