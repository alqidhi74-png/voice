import { unlink } from 'fs/promises'
import { logger } from '../utils/logger.js'

const WINDOWS_LOCK_RETRY_DELAYS_MS = [25, 75, 150]

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds)
})

/**
 * Track request-scoped plaintext files and remove them from a finally block.
 * Duplicate paths are collapsed so callers can safely register both expected
 * and actual preprocessing outputs.
 */
export const createTemporaryFileTracker = () => {
  const paths = new Set()

  return {
    add: (...filePaths) => {
      for (const filePath of filePaths.flat()) {
        if (typeof filePath === 'string' && filePath.trim()) {
          paths.add(filePath)
        }
      }
    },

    list: () => [...paths],

    cleanup: async () => {
      const results = []

      for (const filePath of paths) {
        let deleted = false

        for (let attempt = 0; attempt <= WINDOWS_LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            await unlink(filePath)
            results.push({ filePath, deleted: true })
            deleted = true
            break
          } catch (error) {
            if (error.code === 'ENOENT') {
              results.push({ filePath, deleted: false, missing: true })
              deleted = true
              break
            }

            const canRetry = (error.code === 'EPERM' || error.code === 'EBUSY')
              && attempt < WINDOWS_LOCK_RETRY_DELAYS_MS.length

            if (canRetry) {
              await wait(WINDOWS_LOCK_RETRY_DELAYS_MS[attempt])
              continue
            }

            logger.error('Failed to remove temporary plaintext audio:', {
              filePath,
              error: error.message
            })
            results.push({ filePath, deleted: false, error: error.message })
            break
          }
        }

        if (!deleted) {
          // Retain failed paths so a later cleanup call (including the route's
          // finally block) can retry after external file handles are released.
          continue
        }

        paths.delete(filePath)
      }

      return results
    }
  }
}

export default { createTemporaryFileTracker }
