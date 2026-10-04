#!/usr/bin/env node

/**
 * Script to convert Firebase service account JSON file to .env format
 * Usage: node scripts/convert-json-to-env.js <path-to-json-file>
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const jsonFilePath = process.argv[2]
const envFilePath = join(__dirname, '../.env')

// Validate that JSON file path is provided
if (!jsonFilePath) {
  console.error('❌ Error: JSON file path is required')
  console.error('Usage: node scripts/convert-json-to-env.js <path-to-json-file>')
  console.error('Example: node scripts/convert-json-to-env.js ../path/to/service-account.json')
  process.exit(1)
}

// Check if file exists
if (!existsSync(jsonFilePath)) {
  console.error(`❌ Error: File not found: ${jsonFilePath}`)
  process.exit(1)
}

try {
  // Read the JSON file
  const jsonContent = readFileSync(jsonFilePath, 'utf8')
  const serviceAccount = JSON.parse(jsonContent)

  // Build .env file content
  const envContent = `# Firebase Admin SDK Configuration
# Generated from service account JSON file
# DO NOT commit this file to version control

FIREBASE_TYPE=${serviceAccount.type || 'service_account'}
FIREBASE_PROJECT_ID=${serviceAccount.project_id}
FIREBASE_PRIVATE_KEY_ID=${serviceAccount.private_key_id}
FIREBASE_PRIVATE_KEY="${serviceAccount.private_key.replace(/\n/g, '\\n')}"
FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}
FIREBASE_CLIENT_ID=${serviceAccount.client_id}
FIREBASE_AUTH_URI=${serviceAccount.auth_uri}
FIREBASE_TOKEN_URI=${serviceAccount.token_uri}
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=${serviceAccount.auth_provider_x509_cert_url}
FIREBASE_CLIENT_X509_CERT_URL=${serviceAccount.client_x509_cert_url}
FIREBASE_UNIVERSE_DOMAIN=${serviceAccount.universe_domain || 'googleapis.com'}

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration (comma-separated list of allowed origins)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
`

  // Write to .env file
  writeFileSync(envFilePath, envContent, 'utf8')
  
  console.log('✅ Successfully converted JSON to .env file!')
  console.log(`📄 .env file created at: ${envFilePath}`)
  console.log('⚠️  Remember: Never commit .env file to version control!')
  
} catch (error) {
  console.error('❌ Error converting JSON to .env:', error.message)
  process.exit(1)
}

