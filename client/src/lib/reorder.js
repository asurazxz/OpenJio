// Return a reordered copy; indices describe the item's final position.
export function moveIndex(items, from, to) {
  if (!Array.isArray(items) || !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
