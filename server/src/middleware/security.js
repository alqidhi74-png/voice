import { requireVerifiedEmail } from './auth.js'
import { rejectDangerousInput } from '../utils/validation.js'

export { rejectDangerousInput }

export const secureAuthenticatedRoute = [requireVerifiedEmail]

export const noStore = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  next()
}
