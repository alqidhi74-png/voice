const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M}]*(?: \p{L}[\p{L}\p{M}]*)*$/u

export const normalizePersonName = (value) => {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export const isValidPersonName = (value) => {
  const name = normalizePersonName(value)
  return name.length >= 2 && name.length <= 80 && PERSON_NAME_PATTERN.test(name)
}

export default { normalizePersonName, isValidPersonName }
