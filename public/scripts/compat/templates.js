function interpolate(template, data = {}) {
  return String(template ?? '').replace(/\{\{([^}]+)\}\}/g, (_, key) => String(data[String(key).trim()] ?? ''))
}

export function renderTemplate(template, data = {}) {
  return interpolate(template, data)
}

export async function renderTemplateAsync(template, data = {}) {
  return renderTemplate(template, data)
}

export default {
  renderTemplate,
  renderTemplateAsync,
}
