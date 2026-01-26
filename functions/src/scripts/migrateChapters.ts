import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const userId = process.env.USER_ID

if (!userId) {
  throw new Error('USER_ID is required to run the chapter migration.')
}

const app = initializeApp({ credential: applicationDefault() })
const db = getFirestore(app)

async function migrateChapters(): Promise<void> {
  const milestoneCollection = db.collection(`users/${userId}/milestones`)
  const chapterCollection = db.collection(`users/${userId}/chapters`)
  const taskCollection = db.collection(`users/${userId}/tasks`)

  const milestoneSnapshot = await milestoneCollection.get()
  if (milestoneSnapshot.empty) {
    console.log('No milestones found to migrate.')
  }

  const chapterWrites = milestoneSnapshot.docs.map((doc) => {
    const data = doc.data()
    return chapterCollection.doc(doc.id).set({
      ...data,
      id: data.id ?? doc.id,
    })
  })
  await Promise.all(chapterWrites)
  console.log(`Migrated ${milestoneSnapshot.size} milestones to chapters.`)

  const taskSnapshot = await taskCollection.get()
  const taskUpdates = taskSnapshot.docs
    .filter((doc) => Boolean(doc.data().milestoneId))
    .map((doc) =>
      doc.ref.update({
        chapterId: doc.data().milestoneId,
        milestoneId: FieldValue.delete(),
      })
    )
  await Promise.all(taskUpdates)
  console.log(`Updated ${taskUpdates.length} tasks with chapterId.`)
}

migrateChapters()
  .then(() => {
    console.log('Chapter migration complete.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Chapter migration failed:', error)
    process.exit(1)
  })
