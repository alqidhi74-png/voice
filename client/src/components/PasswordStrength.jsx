import { useState } from 'react'
import { PASSWORD_REQUIREMENTS, evaluatePassword } from '../utils/passwordPolicy'

const PasswordStrength = ({ password }) => {
  const [focused, setFocused] = useState(false)
  const result = evaluatePassword(password)
  const color = result.score < 50 ? 'bg-red-500' : result.score < 85 ? 'bg-amber-400' : 'bg-primary'

  return (
    <div className="relative mt-2" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} tabIndex={-1}>
      <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-label={`Password strength ${result.score}%`}>
        <div className={`h-full transition-all ${color}`} style={{ width: `${result.score}%` }} />
      </div>
      <button
        type="button"
        className="mt-2 text-xs text-text-secondary underline decoration-dotted hover:text-primary"
        onClick={() => setFocused((value) => !value)}
        aria-expanded={focused}
      >
        {result.valid ? 'Strong password' : 'View password requirements'}
      </button>
      {focused && (
        <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-72 rounded-xl border border-border bg-card p-4 shadow-2xl" role="status">
          <p className="mb-2 text-sm font-semibold text-text-primary">Strong password requirements</p>
          <ul className="grid gap-1 text-xs">
            {PASSWORD_REQUIREMENTS.map(({ key, label }) => (
              <li key={key} className={result.checks[key] ? 'text-primary' : 'text-text-secondary'}>
                {result.checks[key] ? '✓' : '○'} {label}
              </li>
            ))}
            <li className={result.checks.uncommon ? 'text-primary' : 'text-text-secondary'}>
              {result.checks.uncommon ? '✓' : '○'} Not a common password
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

export default PasswordStrength
