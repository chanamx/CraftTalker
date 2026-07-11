import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  auditTargetPlugins,
  classifyEndpoint,
  extractEndpointLiterals,
  extractRiskSignals,
  normalizeEndpointLiteral,
} from '../audit-st-plugin-capabilities.mjs'

describe('ST plugin capability audit', () => {
  it('normalizes dynamic same-origin endpoint literals without treating external URLs as host routes', () => {
    expect(normalizeEndpointLiteral('/api/sd/${path}?model=x')).toBe('/api/sd/*')
    expect(normalizeEndpointLiteral('./User Avatars/${avatarId}')).toBe('/User Avatars/*')
    expect(normalizeEndpointLiteral('https://example.com/api/v1')).toBeNull()
    expect(normalizeEndpointLiteral('/api/')).toBeNull()
  })

  it('extracts unique ST host endpoint literals from executable source', () => {
    const source = `
      await fetch('/api/extensions/version');
      await fetch(\`/api/sd/\${path}\`);
      image.src = './User Avatars/' + avatarId;
      await fetch('https://example.com/api/v1');
    `

    expect(extractEndpointLiterals(source)).toEqual([
      '/User Avatars/*',
      '/api/extensions/version',
      '/api/sd/*',
    ])
  })

  it('classifies supported, constrained, opt-in, and blocked endpoint families', () => {
    expect(classifyEndpoint('/api/extensions/version')).toMatchObject({
      capabilityId: 'resource-loading',
      policy: 'read-only',
    })
    expect(classifyEndpoint('/api/files/upload')).toMatchObject({
      capabilityId: 'user-file-storage',
      policy: 'constrained-write',
    })
    expect(classifyEndpoint('/api/sd/ping')).toMatchObject({
      capabilityId: 'image-and-cors-proxy',
      policy: 'opt-in',
    })
    expect(classifyEndpoint('/api/sd/*')).toMatchObject({
      capabilityId: 'image-and-cors-proxy',
      policy: 'blocked',
    })
    expect(classifyEndpoint('/api/extensions/install')).toMatchObject({
      capabilityId: 'extension-management',
      policy: 'blocked',
    })
    expect(classifyEndpoint('/api/not-yet-ledgered')).toBeNull()
    expect(classifyEndpoint('/thumbnail')).toMatchObject({
      capabilityId: 'character-api',
      policy: 'read-only',
    })
  })

  it('detects code-execution and direct-network signals for explicit ledger review', () => {
    const source = `
      const sandbox = new Function('return 1');
      eval(userCode);
      new Worker(workerUrl, { type: 'module' });
      fetch('https://example.com/data');
      TaskJS.execute(script);
    `

    expect(extractRiskSignals(source).map(signal => signal.kind)).toEqual([
      'browser-worker',
      'direct-external-network',
      'dynamic-code',
      'taskjs-system',
    ])
  })

  it('fails newly introduced endpoints, plugin capabilities, and risk classes that lack ledger approval', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st-plugin-capability-audit-'))
    try {
      writePlugin(root, 'JS-Slash-Runner', `fetch('/api/not-yet-ledgered')`)
      writePlugin(root, 'LittleWhiteBox', `fetch('/api/characters/edit')`)
      writePlugin(root, 'ST-Prompt-Template', `TaskJS.execute('system')`)

      const report = auditTargetPlugins({ pluginRoot: root })

      expect(report.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          plugin: 'JS-Slash-Runner',
          kind: 'unclassified-endpoint',
          detail: '/api/not-yet-ledgered',
        }),
        expect.objectContaining({
          plugin: 'LittleWhiteBox',
          kind: 'unapproved-plugin-capability',
          detail: 'character-api:constrained-write: /api/characters/edit',
        }),
        expect.objectContaining({
          plugin: 'ST-Prompt-Template',
          kind: 'unapproved-risk-signal',
          detail: 'taskjs-system',
        }),
      ]))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts only the explicitly baselined capability families for each target plugin', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st-plugin-capability-audit-'))
    try {
      writePlugin(root, 'JS-Slash-Runner', `fetch('/api/extensions/version'); new Function('return 1')`)
      writePlugin(root, 'LittleWhiteBox', `fetch('/api/files/upload'); new Worker('/worker.js')`)
      writePlugin(root, 'ST-Prompt-Template', `new Function('return 1')`)

      expect(auditTargetPlugins({ pluginRoot: root }).findings).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

function writePlugin(root, name, source) {
  const directory = path.join(root, name)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'index.js'), source, 'utf8')
}
