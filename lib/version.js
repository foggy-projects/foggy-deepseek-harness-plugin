export function versionParts(text) {
  const match = String(text).match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  return match ? match.slice(1).map((part) => Number(part || 0)) : []
}

export function compatible(probe, minimum) {
  if (!probe.available) return { ...probe, detected: false, minimum }
  const actual = versionParts(probe.output)
  const wanted = versionParts(minimum)
  for (let index = 0; index < wanted.length; index += 1) {
    if ((actual[index] ?? 0) > wanted[index]) return { ...probe, detected: true, available: true, minimum }
    if ((actual[index] ?? 0) < wanted[index]) return { ...probe, detected: true, available: false, minimum }
  }
  return { ...probe, detected: true, available: true, minimum }
}

export function compatibleNode(version) {
  const [major, minor] = String(version).split('.').map(Number)
  return (major === 22 && minor >= 19) || major >= 24
}
