export function getTokenCount(value) {
  return Math.ceil(String(value ?? '').length / 4)
}

export async function getTokenCountAsync(value) {
  return getTokenCount(value)
}

export default {
  getTokenCount,
  getTokenCountAsync,
}
