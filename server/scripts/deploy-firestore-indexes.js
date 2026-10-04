import dotenv from 'dotenv'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import firestorePackage from '@google-cloud/firestore'

const { v1 } = firestorePackage

dotenv.config()

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Firebase service-account credentials are required')
}

const manifest = JSON.parse(await readFile(resolve('..', 'firestore.indexes.json'), 'utf8'))
const client = new v1.FirestoreAdminClient({
  projectId,
  credentials: { client_email: clientEmail, private_key: privateKey }
})
const parent = client.databasePath(projectId, '(default)')

try {
  const results = []
  for (const definition of manifest.indexes || []) {
    const index = {
      queryScope: definition.queryScope,
      fields: definition.fields.map(field => ({
        fieldPath: field.fieldPath,
        order: field.order
      }))
    }
    try {
      const [operation] = await client.createIndex({ parent, index })
      results.push({ fields: definition.fields, status: 'CREATING', operation: operation.name })
    } catch (error) {
      if (error.code === 6 || /already exists/i.test(error.message)) {
        results.push({ fields: definition.fields, status: 'ALREADY_EXISTS' })
        continue
      }
      throw error
    }
  }
  process.stdout.write(`${JSON.stringify({ success: true, indexes: results }, null, 2)}\n`)
} catch (error) {
  const permissionDenied = error.code === 7
  process.stderr.write(`${JSON.stringify({
    success: false,
    code: permissionDenied ? 'INDEX_DEPLOY_PERMISSION_DENIED' : 'INDEX_DEPLOY_FAILED',
    message: permissionDenied
      ? 'Grant the service account datastore index administration permission, then retry.'
      : 'Firestore index deployment failed.'
  }, null, 2)}\n`)
  process.exitCode = 1
}
