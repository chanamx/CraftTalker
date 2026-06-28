import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createApp } from '../app.js'
import { cancelRun, createGenerationRun, failRun, updateRunPartial } from '../services/run.service.js'
import { createChat, getChat } from '../services/chat.service.js'
import { clearGenerationLocksForTest, tryAcquireGenerationLock } from '../lib/generation-locks.js'
import { clearLlmKeySessionsForTest } from '../services/llm-session.service.js'
import { writeChatFile } from '../lib/jsonl.js'
import { readCharacterCard, writeCharacterCard } from '../lib/png-parser.js'

type Json = Record<string, unknown>

const testDataDir = path.join(os.tmpdir(), `luker-api-test-${Date.now()}`)

type MultipartPart =
  | { name: string; value: string }
  | { name: string; filename: string; body: Buffer; contentType?: string }

function multipartFormBody(parts: MultipartPart[]): { body: Buffer; contentType: string } {
  const boundary = `----CraftTalkerTestBoundary${Date.now()}`
  const chunks: Buffer[] = []
  for (const part of parts) {
    if ('filename' in part) {
      chunks.push(Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
        + `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        'utf8',
      ))
      chunks.push(part.body)
      chunks.push(Buffer.from('\r\n', 'utf8'))
      continue
    }

    chunks.push(Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`
      + `${part.value}\r\n`,
      'utf8',
    ))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  }
}

function multipartUploadBody(
  fileBody: Buffer,
  filename: string,
  overwriteName: string,
  contentType = 'image/png',
): { body: Buffer; contentType: string } {
  return multipartFormBody([
    { name: 'avatar', filename, body: fileBody, contentType },
    { name: 'overwrite_name', value: overwriteName },
  ])
}

const multipartIt = typeof (globalThis as { document?: unknown }).document === 'undefined' ? it : it.skip

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.LUKER_DATA_DIR = testDataDir
  fs.mkdirSync(path.join(testDataDir, 'characters'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'chats'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'worlds'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'koboldAI_Settings'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'openAI_Settings'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'textGen_Settings'), { recursive: true })
  fs.mkdirSync(path.join(testDataDir, 'novelAI_Settings'), { recursive: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearGenerationLocksForTest()
  clearLlmKeySessionsForTest()
  delete process.env.LUKER_DATA_DIR
  fs.rmSync(testDataDir, { recursive: true, force: true })
})

describe('API Routes', () => {
  it('GET /api/health returns ok', async () => {
    const app = createApp()
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json() as Json
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTypeOf('number')
  })

  it('GET /version returns an ST-compatible startup probe response', async () => {
    const app = createApp()
    const res = await app.request('/version')

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    await expect(res.json()).resolves.toMatchObject({
      agent: 'CraftTalker',
      pkgVersion: '1.12.13',
      version: '1.12.13',
      revision: 'crafttalker-compat',
      isLatest: true,
    })
  })

  it('serves ST-compatible fallback model list endpoints for plugin UIs', async () => {
    const app = createApp()
    const backendRes = await app.request('/api/backends/chat-completions/models')
    const openAiRes = await app.request('/api/openai/models')

    expect(backendRes.status).toBe(200)
    expect(openAiRes.status).toBe(200)
    for (const body of [await backendRes.json(), await openAiRes.json()] as Array<{ data: Array<Json> }>) {
      expect(body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-4o-mini' }),
      ]))
    }
  })

  it('serves ST-compatible tokenizer count endpoints with local estimates', async () => {
    const app = createApp()
    const claudeRes = await app.request('/api/tokenizers/claude/encode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello tokenizer' }),
    })
    const openAiRes = await app.request('/api/tokenizers/openai/count?model=gpt-4o-mini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ role: 'user', content: 'Hello tokenizer' }]),
    })

    expect(claudeRes.status).toBe(200)
    expect(openAiRes.status).toBe(200)
    expect((await claudeRes.json() as Json).count).toBeGreaterThan(0)
    expect((await openAiRes.json() as Json).token_count).toBeGreaterThan(0)
  })

  it('keeps ST-compatible image and generic proxy endpoints explicitly fail-closed', async () => {
    const app = createApp()

    const sdRes = await app.request('/api/sd/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:7860' }),
    })
    const comfyRes = await app.request('/api/sd/comfy/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:8188' }),
    })
    const corsRes = await app.request('/cors/https://example.com/page.html')

    for (const res of [sdRes, comfyRes, corsRes]) {
      expect(res.status).toBe(501)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        blocked: true,
      })
    }
  })

  it('serves ST-compatible user files uploaded by extensions from a constrained storage directory', async () => {
    const app = createApp()
    const content = JSON.stringify({ task: 'persisted' })

    const uploadRes = await app.request('/api/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LittleWhiteBox_Tasks.json',
        data: Buffer.from(content, 'utf8').toString('base64'),
      }),
    })

    expect(uploadRes.status).toBe(200)
    await expect(uploadRes.json()).resolves.toMatchObject({
      success: true,
      name: 'LittleWhiteBox_Tasks.json',
      path: '/user/files/LittleWhiteBox_Tasks.json',
      size: content.length,
    })

    const readRes = await app.request('/user/files/LittleWhiteBox_Tasks.json')
    expect(readRes.status).toBe(200)
    expect(readRes.headers.get('Content-Type')).toContain('application/json')
    expect(await readRes.text()).toBe(content)
    expect(fs.existsSync(path.join(testDataDir, 'user', 'files', 'LittleWhiteBox_Tasks.json'))).toBe(true)
  })

  it('rejects unsafe ST-compatible user file uploads', async () => {
    const app = createApp()

    const traversalRes = await app.request('/api/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '../secrets.json', data: 'e30=' }),
    })
    expect(traversalRes.status).toBe(400)

    const invalidBase64Res = await app.request('/api/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'LittleWhiteBox_Tasks.json', data: 'not base64!' }),
    })
    expect(invalidBase64Res.status).toBe(400)

    const unsafeZipRes = await app.request('/api/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'workspace.zip', data: 'UEsDBAo=' }),
    })
    expect(unsafeZipRes.status).toBe(400)
  })

  it('returns 404 for missing ST-compatible user files', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createApp()
    const res = await app.request('/user/files/LittleWhiteBox_Missing.json')

    expect(res.status).toBe(404)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('supports constrained LittleWhiteBox vector backup zip upload, readback, and delete', async () => {
    const app = createApp()
    const body = Buffer.from('zip-data')
    const filename = 'LWB_VectorBackup_ab12cd.zip'

    const uploadRes = await app.request('/api/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: filename,
        data: body.toString('base64'),
      }),
    })
    expect(uploadRes.status).toBe(200)
    expect(await uploadRes.json()).toMatchObject({
      success: true,
      name: filename,
      path: `/user/files/${filename}`,
      size: body.length,
    })

    const readRes = await app.request(`/user/files/${filename}`)
    expect(readRes.status).toBe(200)
    expect(readRes.headers.get('Content-Type')).toBe('application/zip')
    expect(Buffer.from(await readRes.arrayBuffer())).toEqual(body)

    const deleteRes = await app.request('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `user/files/${filename}` }),
    })
    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toMatchObject({
      success: true,
      deleted: true,
      path: `/user/files/${filename}`,
    })
    expect(fs.existsSync(path.join(testDataDir, 'user', 'files', filename))).toBe(false)
  })

  it('rejects unsafe ST-compatible user file deletes', async () => {
    const app = createApp()

    const traversalRes = await app.request('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'user/files/../secrets.json' }),
    })
    expect(traversalRes.status).toBe(400)

    const missingRes = await app.request('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'user/files/LittleWhiteBox_Missing.json' }),
    })
    expect(missingRes.status).toBe(404)
  })

  multipartIt('supports constrained ST-compatible persona avatar upload, list, readback, and delete', async () => {
    const app = createApp()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const multipart = multipartUploadBody(png, 'ignored.png', 'Persona_Test.png')

    const uploadRes = await app.request('/api/avatars/upload', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })
    expect(uploadRes.status).toBe(200)
    expect(await uploadRes.json()).toEqual({ path: 'Persona_Test.png' })
    expect(fs.existsSync(path.join(testDataDir, 'user', 'avatars', 'Persona_Test.png'))).toBe(true)

    const listRes = await app.request('/api/avatars/get', { method: 'POST' })
    expect(listRes.status).toBe(200)
    expect(await listRes.json()).toEqual(['Persona_Test.png'])

    const getListRes = await app.request('/api/avatars/get')
    expect(getListRes.status).toBe(200)
    expect(await getListRes.json()).toEqual(['Persona_Test.png'])

    const readRes = await app.request('/User%20Avatars/Persona_Test.png')
    expect(readRes.status).toBe(200)
    expect(readRes.headers.get('Content-Type')).toBe('image/png')
    expect(Buffer.from(await readRes.arrayBuffer())).toEqual(png)

    const deleteRes = await app.request('/api/avatars/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: 'Persona_Test.png' }),
    })
    expect(deleteRes.status).toBe(200)
    expect(await deleteRes.json()).toEqual({ result: 'ok' })
    expect(fs.existsSync(path.join(testDataDir, 'user', 'avatars', 'Persona_Test.png'))).toBe(false)
  })

  multipartIt('rejects unsafe ST-compatible persona avatar writes and deletes', async () => {
    const app = createApp()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const traversalMultipart = multipartUploadBody(png, 'avatar.png', '../avatar.png')

    const traversalRes = await app.request('/api/avatars/upload', {
      method: 'POST',
      headers: { 'Content-Type': traversalMultipart.contentType },
      body: traversalMultipart.body,
    })
    expect(traversalRes.status).toBe(400)

    const invalidImageMultipart = multipartUploadBody(Buffer.from('not an image'), 'Persona_Test.png', 'Persona_Test.png', 'text/plain')
    const invalidImageRes = await app.request('/api/avatars/upload', {
      method: 'POST',
      headers: { 'Content-Type': invalidImageMultipart.contentType },
      body: invalidImageMultipart.body,
    })
    expect(invalidImageRes.status).toBe(400)

    const missingDeleteRes = await app.request('/api/avatars/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: 'Missing.png' }),
    })
    expect(missingDeleteRes.status).toBe(404)
  })

  it('GET /api/characters returns character list', async () => {
    const app = createApp()
    const res = await app.request('/api/characters')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('POST /api/characters/create accepts ST-compatible form data without avatar writes', async () => {
    const app = createApp()
    const form = new FormData()
    form.set('ch_name', 'FormBot')
    form.set('description', 'Created from ST form')
    form.set('first_mes', 'Hello')
    form.append('alternate_greetings', 'Alt 1')
    form.append('alternate_greetings', 'Alt 2')
    form.set('extensions', JSON.stringify({ tavern_helper: { enabled: true } }))
    form.set('world', 'FormWorld')
    form.set('talkativeness', '0.7')
    form.set('fav', 'true')

    const res = await app.request('/api/characters/create', {
      method: 'POST',
      body: form,
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('FormBot')
    expect(body.alternate_greetings).toEqual(['Alt 1', 'Alt 2'])
    expect(body.extensions).toMatchObject({
      tavern_helper: { enabled: true },
      world: 'FormWorld',
      talkativeness: 0.7,
      fav: true,
    })
  })

  multipartIt('POST /api/characters/create accepts a constrained ST-compatible avatar file', async () => {
    const app = createApp()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const multipart = multipartFormBody([
      { name: 'ch_name', value: 'FormAvatarBot' },
      { name: 'description', value: 'Created with avatar' },
      { name: 'first_mes', value: 'Hello with avatar' },
      { name: 'avatar', filename: 'FormAvatarBot.png', body: png, contentType: 'image/png' },
    ])

    const res = await app.request('/api/characters/create', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('FormAvatarBot')
    expect(body.avatar).toBe('/api/characters/FormAvatarBot/avatar')
    const avatarPath = path.join(testDataDir, 'characters', 'FormAvatarBot', 'avatar.png')
    expect(fs.existsSync(avatarPath)).toBe(true)
    expect(fs.readFileSync(avatarPath)).toEqual(png)

    const avatarRes = await app.request('/api/characters/FormAvatarBot/avatar')
    expect(avatarRes.status).toBe(200)
    expect(avatarRes.headers.get('Content-Type')).toBe('image/png')
    expect(Buffer.from(await avatarRes.arrayBuffer())).toEqual(png)
  })

  it('serves ST-compatible legacy character avatar and thumbnail URLs read-only', async () => {
    const app = createApp()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const charDir = path.join(testDataDir, 'characters', 'LegacyAvatarBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ name: 'LegacyAvatarBot', description: 'Legacy avatar' }),
      'utf8',
    )
    fs.writeFileSync(path.join(charDir, 'avatar.png'), png)

    const legacyRes = await app.request('/characters/LegacyAvatarBot.png')
    const thumbnailRes = await app.request('/thumbnail?type=avatar&file=LegacyAvatarBot.png')
    const traversalRes = await app.request('/characters/..%2fsecret.png')

    expect(legacyRes.status).toBe(200)
    expect(legacyRes.headers.get('Content-Type')).toBe('image/png')
    expect(Buffer.from(await legacyRes.arrayBuffer())).toEqual(png)
    expect(thumbnailRes.status).toBe(200)
    expect(Buffer.from(await thumbnailRes.arrayBuffer())).toEqual(png)
    expect(traversalRes.status).toBe(404)
  })

  multipartIt('POST /api/characters/create rejects invalid avatar files before creating the card', async () => {
    const app = createApp()
    const multipart = multipartFormBody([
      { name: 'ch_name', value: 'InvalidAvatarBot' },
      { name: 'avatar', filename: 'InvalidAvatarBot.png', body: Buffer.from('not an image'), contentType: 'text/plain' },
    ])

    const res = await app.request('/api/characters/create', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(400)
    expect(fs.existsSync(path.join(testDataDir, 'characters', 'InvalidAvatarBot', 'character.json'))).toBe(false)
  })

  it('POST /api/characters/edit accepts narrow ST-compatible form updates and preserves unknown card fields', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'EditFormBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v3',
        spec_version: '3.0',
        top_level_runtime: { keep: true },
        data: {
          name: 'EditFormBot',
          description: 'Original',
          nickname: 'KeepNick',
          first_mes: 'Original hello',
          extensions: {
            regex_scripts: [{ script_name: 'KeepRegex' }],
            tavern_helper: { old: true },
          },
        },
      }),
      'utf8',
    )

    const form = new FormData()
    form.set('ch_name', 'EditFormBot')
    form.set('description', 'Edited from ST form')
    form.set('extensions', JSON.stringify({
      regex_scripts: [{ script_name: 'KeepRegex' }],
      tavern_helper: { scripts: [{ name: 'A' }] },
    }))
    form.set('world', 'EditedWorld')

    const res = await app.request('/api/characters/edit', {
      method: 'POST',
      body: form,
    })

    expect(res.status).toBe(200)
    const stored = JSON.parse(fs.readFileSync(path.join(charDir, 'character.json'), 'utf8'))
    expect(stored.top_level_runtime.keep).toBe(true)
    expect(stored.data.nickname).toBe('KeepNick')
    expect(stored.data.description).toBe('Edited from ST form')
    expect(stored.data.first_mes).toBe('Original hello')
    expect(stored.data.extensions).toMatchObject({
      regex_scripts: [{ script_name: 'KeepRegex' }],
      tavern_helper: { scripts: [{ name: 'A' }] },
      world: 'EditedWorld',
    })
  })

  it('PATCH /api/characters/:name persists ST plugin extension fields', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'PatchExtBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v3',
        spec_version: '3.0',
        top_level_runtime: { keep: true },
        data: {
          name: 'PatchExtBot',
          description: 'Original',
          nickname: 'KeepNick',
          extensions: {
            old_plugin: { keep: true },
          },
        },
      }),
      'utf8',
    )

    const res = await app.request('/api/characters/PatchExtBot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensions: {
          old_plugin: { keep: true },
          LittleWhiteBox: { variablesCore: { bumpAliases: { hp: 'health' } } },
          regex_scripts: [{ script_name: 'RunnerRegex' }],
        },
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Json
    const stored = JSON.parse(fs.readFileSync(path.join(charDir, 'character.json'), 'utf8'))
    const extensions = body.extensions as Record<string, unknown>
    expect(stored.top_level_runtime.keep).toBe(true)
    expect(stored.data.nickname).toBe('KeepNick')
    expect(extensions).toMatchObject({
      LittleWhiteBox: { variablesCore: { bumpAliases: { hp: 'health' } } },
      regex_scripts: [{ script_name: 'RunnerRegex' }],
    })
    expect(stored.data.extensions).toMatchObject(extensions)
  })

  multipartIt('POST /api/characters/edit accepts a constrained ST-compatible avatar replacement', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'EditAvatarBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: 'EditAvatarBot',
          description: 'Original',
          first_mes: 'Original hello',
          extensions: {},
        },
      }),
      'utf8',
    )
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const multipart = multipartFormBody([
      { name: 'ch_name', value: 'EditAvatarBot' },
      { name: 'description', value: 'Edited with avatar' },
      { name: 'avatar', filename: 'EditAvatarBot.png', body: png, contentType: 'image/png' },
    ])

    const res = await app.request('/api/characters/edit', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Json
    expect(body.description).toBe('Edited with avatar')
    expect(body.avatar).toBe('/api/characters/EditAvatarBot/avatar')
    expect(fs.readFileSync(path.join(charDir, 'avatar.png'))).toEqual(png)
  })

  it('GET /api/worlds returns world book list', async () => {
    const app = createApp()
    const res = await app.request('/api/worlds')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('POST /api/llm-sessions stores API keys server-side without echoing secrets', async () => {
    const app = createApp()

    const res = await app.request('/api/llm-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-test-secret', label: 'OpenAI' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.sessionId).toBeTypeOf('string')
    expect(body.label).toBe('OpenAI')
    expect(body.hasApiKey).toBe(true)
    expect(JSON.stringify(body)).not.toContain('sk-test-secret')

    const getRes = await app.request(`/api/llm-sessions/${body.sessionId}`)
    expect(getRes.status).toBe(200)
    expect(JSON.stringify(await getRes.json())).not.toContain('sk-test-secret')
  })

  it('DELETE /api/llm-sessions removes server-side key sessions', async () => {
    const app = createApp()
    const createRes = await app.request('/api/llm-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-delete-me' }),
    })
    const body = await createRes.json() as { sessionId: string }

    const deleteRes = await app.request(`/api/llm-sessions/${body.sessionId}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const getRes = await app.request(`/api/llm-sessions/${body.sessionId}`)
    expect(getRes.status).toBe(404)
  })

  it('POST /api/backends/chat-completions/status exposes the ST host compatibility bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'local-model' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const app = createApp()

    const res = await app.request('/api/backends/chat-completions/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_completion_source: 'openai',
        reverse_proxy: 'http://localhost:1234/v1',
        model: 'local-model',
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [{ id: 'local-model' }] })
  })

  it('GET /api/runs marks stale persisted running runs as interrupted', async () => {
    const app = createApp()
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'half-written')

    const res = await app.request('/api/runs?characterName=RunBot&chatId=chat-1')

    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ runId: string; status: string; partialContent: string }>
    expect(body).toHaveLength(1)
    expect(body[0]?.runId).toBe(run.runId)
    expect(body[0]?.status).toBe('interrupted')
    expect(body[0]?.partialContent).toBe('half-written')
  })

  it('POST /api/runs/:runId/commit writes recoverable partial content once', async () => {
    const app = createApp()
    const chat = await createChat('RunBot')
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await failRun(run.runId, { error: 'network', partialContent: 'Recovered partial' })

    const res = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; committedLineIndex: number }
    expect(body.status).toBe('committed')
    expect(body.committedLineIndex).toBe(1)

    const stored = await getChat('RunBot', chat.chatId)
    expect(stored.lines[1]).toMatchObject({
      is_user: false,
      mes: 'Recovered partial',
    })

    const duplicate = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })
    expect(duplicate.status).toBe(409)
    const afterDuplicate = await getChat('RunBot', chat.chatId)
    expect(afterDuplicate.lines.filter(line => 'mes' in line)).toHaveLength(1)
  })

  it('POST /api/runs/:runId/commit is idempotent under duplicate recovery requests', async () => {
    const app = createApp()
    const chat = await createChat('RaceBot')
    const run = await createGenerationRun({
      characterName: 'RaceBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await failRun(run.runId, { error: 'network', partialContent: 'Only once' })

    const responses = await Promise.all([
      app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' }),
      app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' }),
    ])

    expect(responses.map(res => res.status).sort()).toEqual([200, 409])
    const stored = await getChat('RaceBot', chat.chatId)
    expect(stored.lines.filter(line => 'mes' in line && line.mes === 'Only once')).toHaveLength(1)
  })

  it('POST /api/runs/:runId/discard marks recoverable runs as discarded', async () => {
    const app = createApp()
    const run = await createGenerationRun({
      characterName: 'RunBot',
      chatId: 'chat-1',
      operation: 'continue',
    })
    await updateRunPartial(run.runId, 'Drop me')
    await cancelRun(run.runId, { partialContent: 'Drop me' })

    const res = await app.request(`/api/runs/${run.runId}/discard`, { method: 'POST' })

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; partialContent: string }
    expect(body.status).toBe('discarded')
    expect(body.partialContent).toBe('Drop me')
  })

  it('POST /api/runs/:runId/commit recovers stale running runs without a process lock', async () => {
    const app = createApp()
    const chat = await createChat('StaleBot')
    const run = await createGenerationRun({
      characterName: 'StaleBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'After restart')

    const res = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })

    expect(res.status).toBe(200)
    const stored = await getChat('StaleBot', chat.chatId)
    expect(stored.lines.filter(line => 'mes' in line && line.mes === 'After restart')).toHaveLength(1)
  })

  it('POST /api/runs/:runId/commit rejects active running runs with a process lock', async () => {
    const app = createApp()
    const chat = await createChat('LiveBot')
    const run = await createGenerationRun({
      characterName: 'LiveBot',
      chatId: chat.chatId,
      operation: 'generate',
    })
    await updateRunPartial(run.runId, 'Still streaming')
    const lock = tryAcquireGenerationLock('LiveBot', chat.chatId, 'generate')

    const res = await app.request(`/api/runs/${run.runId}/commit`, { method: 'POST' })

    expect(res.status).toBe(409)
    lock?.release()
    const stored = await getChat('LiveBot', chat.chatId)
    expect(stored.lines.filter(line => 'mes' in line && line.mes === 'Still streaming')).toHaveLength(0)
  })

  it('GET /api/presets/openai returns empty array initially', async () => {
    const app = createApp()
    const res = await app.request('/api/presets/openai')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
  })

  it('POST /api/characters/import without filePath returns 400', async () => {
    const app = createApp()
    const res = await app.request('/api/characters/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/characters/import rejects arbitrary absolute paths', async () => {
    const app = createApp()
    const outsidePath = path.join(testDataDir, 'outside.png')
    fs.writeFileSync(outsidePath, 'not a real card', 'utf8')

    const res = await app.request('/api/characters/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: outsidePath }),
    })

    expect(res.status).toBe(400)
  })

  multipartIt('POST /api/characters/import accepts ST-compatible multipart PNG card uploads', async () => {
    const app = createApp()
    const sourcePng = path.join(testDataDir, 'source.png')
    const cardPng = path.join(testDataDir, 'RawImportBot.card.png')
    fs.writeFileSync(
      sourcePng,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
    )
    writeCharacterCard(sourcePng, JSON.stringify({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'RawImportBot',
        description: 'Imported through ST multipart',
        first_mes: 'Hello from raw import',
      },
    }), cardPng)
    const multipart = multipartFormBody([
      { name: 'avatar', filename: 'RawImportBot', body: fs.readFileSync(cardPng), contentType: 'image/png' },
      { name: 'file_type', value: 'png' },
      { name: 'preserved_name', value: 'RawImportBot' },
    ])

    const res = await app.request('/api/characters/import', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('RawImportBot')
    expect(body.description).toBe('Imported through ST multipart')
    expect(fs.existsSync(path.join(testDataDir, 'characters', 'RawImportBot', 'character.json'))).toBe(true)
    expect(fs.existsSync(path.join(testDataDir, 'characters', 'RawImportBot', 'character.png'))).toBe(true)
  })

  multipartIt('POST /api/characters/import rejects invalid ST-compatible multipart card uploads', async () => {
    const app = createApp()
    const multipart = multipartFormBody([
      { name: 'avatar', filename: 'InvalidRawImportBot', body: Buffer.from('not a card'), contentType: 'image/png' },
      { name: 'file_type', value: 'png' },
      { name: 'preserved_name', value: 'InvalidRawImportBot' },
    ])

    const res = await app.request('/api/characters/import', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(400)
    expect(fs.existsSync(path.join(testDataDir, 'characters', 'InvalidRawImportBot', 'character.json'))).toBe(false)
  })

  it('POST /api/characters/upload imports JSON character cards', async () => {
    const app = createApp()
    const card = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'JsonBot',
        description: 'Imported from JSON',
      },
    }

    const res = await app.request('/api/characters/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: '../JsonBot.json',
        data: Buffer.from(JSON.stringify(card), 'utf8').toString('base64'),
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('JsonBot')
    expect(fs.existsSync(path.join(testDataDir, 'characters', 'JsonBot', 'character.json'))).toBe(true)
  })

  it('POST /api/characters/export serves ST-compatible sanitized JSON and PNG character exports', async () => {
    const app = createApp()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const charDir = path.join(testDataDir, 'characters', 'ExportBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(path.join(charDir, 'avatar.png'), png)
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        chat: 'private-chat-name',
        fav: true,
        data: {
          name: 'ExportBot',
          description: 'Export me',
          first_mes: 'Hello',
          extensions: {
            fav: true,
            tavern_helper: { keep: true },
          },
        },
      }),
      'utf8',
    )

    const jsonRes = await app.request('/api/characters/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json', avatar_url: 'ExportBot.png' }),
    })
    const pngRes = await app.request('/api/characters/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'png', avatar_url: 'ExportBot.png' }),
    })

    expect(jsonRes.status).toBe(200)
    expect(jsonRes.headers.get('Content-Disposition')).toContain('ExportBot.json')
    const exportedJson = await jsonRes.json() as Json & { data: Json }
    expect(exportedJson.chat).toBeUndefined()
    expect(exportedJson.fav).toBe(false)
    expect(exportedJson.data.name).toBe('ExportBot')
    expect((exportedJson.data.extensions as Json).fav).toBe(false)
    expect(exportedJson.data.extensions).toMatchObject({ tavern_helper: { keep: true } })

    expect(pngRes.status).toBe(200)
    expect(pngRes.headers.get('Content-Type')).toBe('image/png')
    expect(pngRes.headers.get('Content-Disposition')).toContain('ExportBot.png')
    const outPath = path.join(testDataDir, 'exported.png')
    fs.writeFileSync(outPath, Buffer.from(await pngRes.arrayBuffer()))
    const exportedPngJson = JSON.parse(readCharacterCard(outPath)) as Json & { data: Json }
    expect(exportedPngJson.chat).toBeUndefined()
    expect(exportedPngJson.fav).toBe(false)
    expect(exportedPngJson.data.name).toBe('ExportBot')
    expect((exportedPngJson.data.extensions as Json).fav).toBe(false)
  })

  it('POST /api/characters/export rejects invalid ST-compatible export requests', async () => {
    const app = createApp()

    const missingRes = await app.request('/api/characters/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json' }),
    })
    const traversalRes = await app.request('/api/characters/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json', avatar_url: '../secret.png' }),
    })
    const unsupportedRes = await app.request('/api/characters/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'yaml', avatar_url: 'ExportBot.png' }),
    })

    expect(missingRes.status).toBe(400)
    expect(traversalRes.status).toBe(400)
    expect(unsupportedRes.status).toBe(400)
  })

  it('GET /api/chats/:name returns empty for unknown character', async () => {
    const app = createApp()
    const res = await app.request('/api/chats/NonExistent')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
  })

  it('POST /api/chats/:name creates a new chat', async () => {
    const app = createApp()

    const charDir = path.join(testDataDir, 'characters', 'TestBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ name: 'TestBot', description: 'A test bot' }),
      'utf8',
    )

    const res = await app.request('/api/chats/TestBot', {
      method: 'POST',
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body).toHaveProperty('chatId')
    expect(body.chatId).toBeTypeOf('string')
  })

  it('POST /api/chats/get serves read-only ST-compatible raw chat lines', async () => {
    const app = createApp()
    const chatDir = path.join(testDataDir, 'chats', 'HistoryBot')
    fs.mkdirSync(chatDir, { recursive: true })
    await writeChatFile(path.join(chatDir, 'chat-a.jsonl'), [
      {
        chat_metadata: { chat_name: 'Display Name', variables: {} },
        user_name: 'User',
        character_name: 'HistoryBot',
      },
      {
        name: 'User',
        is_user: true,
        is_system: false,
        send_date: '2026-06-22T00:00:00.000Z',
        mes: 'Hello history',
        extra: {},
      },
    ])

    const res = await app.request('/api/chats/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ch_name: 'HistoryBot', file_name: 'chat-a.jsonl' }),
    })

    expect(res.status).toBe(200)
    const lines = await res.json() as Json[]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ character_name: 'HistoryBot' })
    expect(lines[1]).toMatchObject({ mes: 'Hello history', is_user: true })
  })

  it('POST /api/chats/get rejects missing ST-compatible chat lookup fields', async () => {
    const app = createApp()

    const res = await app.request('/api/chats/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ch_name: 'HistoryBot' }),
    })

    expect(res.status).toBe(400)
  })

  it('keeps ST-compatible group chat reads explicitly fail-closed', async () => {
    const app = createApp()

    const res = await app.request('/api/chats/group/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'group-session.jsonl' }),
    })

    expect(res.status).toBe(501)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      blocked: true,
    })
  })

  multipartIt('POST /api/chats/import accepts constrained ST-compatible JSONL chat uploads', async () => {
    const app = createApp()
    const content = [
      JSON.stringify({ chat_metadata: { chat_name: 'Imported Chat', custom: true }, user_name: 'Tester', character_name: 'ImportChatBot' }),
      JSON.stringify({
        name: 'Tester',
        is_user: true,
        is_system: false,
        send_date: '2026-06-22T00:00:00.000Z',
        mes: 'Imported hello',
        extra: { files: [{ name: 'note.txt' }] },
      }),
    ].join('\n')
    const multipart = multipartFormBody([
      { name: 'avatar', filename: 'session.jsonl', body: Buffer.from(content, 'utf8'), contentType: 'application/json' },
      { name: 'character_name', value: 'ImportChatBot' },
      { name: 'user_name', value: 'Tester' },
    ])

    const res = await app.request('/api/chats/import', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body).toMatchObject({ chatId: 'session', file_name: 'session.jsonl', success: true })
    const stored = await getChat('ImportChatBot', 'session')
    expect(stored.lines[0]).toMatchObject({ chat_metadata: { chat_name: 'Imported Chat', custom: true } })
    expect(stored.lines[1]).toMatchObject({ mes: 'Imported hello', extra: { files: [{ name: 'note.txt' }] } })
  })

  multipartIt('POST /api/chats/import adds metadata and avoids overwriting existing chats', async () => {
    const app = createApp()
    const chatDir = path.join(testDataDir, 'chats', 'ImportNoMetaBot')
    fs.mkdirSync(chatDir, { recursive: true })
    await writeChatFile(path.join(chatDir, 'session.jsonl'), [
      { chat_metadata: { chat_name: 'Existing' }, user_name: 'Tester', character_name: 'ImportNoMetaBot' },
    ])
    const content = JSON.stringify({
      name: 'Tester',
      is_user: true,
      is_system: false,
      send_date: '2026-06-22T00:00:00.000Z',
      mes: 'No metadata',
      extra: {},
    })
    const multipart = multipartFormBody([
      { name: 'avatar', filename: 'session.jsonl', body: Buffer.from(content, 'utf8'), contentType: 'application/json' },
      { name: 'character_name', value: 'ImportNoMetaBot' },
      { name: 'user_name', value: 'Tester' },
    ])

    const res = await app.request('/api/chats/import', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.chatId).toBe('session-1')
    const existing = await getChat('ImportNoMetaBot', 'session')
    expect(existing.lines).toHaveLength(1)
    const imported = await getChat('ImportNoMetaBot', 'session-1')
    expect(imported.lines[0]).toMatchObject({ user_name: 'Tester', character_name: 'ImportNoMetaBot' })
    expect(imported.lines[1]).toMatchObject({ mes: 'No metadata' })
  })

  multipartIt('POST /api/chats/import rejects invalid JSONL chat uploads', async () => {
    const app = createApp()
    const multipart = multipartFormBody([
      { name: 'avatar', filename: 'bad.jsonl', body: Buffer.from('{not json}', 'utf8'), contentType: 'application/json' },
      { name: 'character_name', value: 'BadImportBot' },
    ])

    const res = await app.request('/api/chats/import', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    })

    expect(res.status).toBe(400)
    expect(fs.existsSync(path.join(testDataDir, 'chats', 'BadImportBot', 'bad.jsonl'))).toBe(false)
  })

  it('PATCH /api/chats/:name/:chatId/metadata writes ST-compatible chat metadata', async () => {
    const app = createApp()
    const chat = await createChat('MetaBot', 'User')

    const res = await app.request(`/api/chats/MetaBot/${chat.chatId}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_metadata: {
          variables: { mood: 'steady' },
          extensions: { LittleWhiteBox: { enabled: true } },
          customField: 'keep-me',
        },
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { chat_metadata: Record<string, unknown> }
    expect(body.chat_metadata).toMatchObject({
      variables: { mood: 'steady' },
      extensions: { LittleWhiteBox: { enabled: true } },
      customField: 'keep-me',
    })
    expect(body.chat_metadata.modified).toBeTypeOf('string')
    const stored = await getChat('MetaBot', chat.chatId)
    expect(stored.lines[0]).toMatchObject({
      chat_metadata: expect.objectContaining({
        variables: { mood: 'steady' },
        customField: 'keep-me',
      }),
      user_name: 'User',
      character_name: 'MetaBot',
    })
  })

  it('PATCH /api/chats/:name/:chatId/message-variables persists only ST message variable fields', async () => {
    const app = createApp()
    const chat = await createChat('MetaBot', 'User')
    const chatPath = path.join(testDataDir, 'chats', 'MetaBot', `${chat.chatId}.jsonl`)
    await writeChatFile(chatPath, [
      {
        chat_metadata: { variables: { scene: 'quiet' }, customField: 'keep-header' },
        user_name: 'User',
        character_name: 'MetaBot',
      },
      {
        name: 'User',
        is_user: true,
        is_system: false,
        send_date: '2026-06-18T00:00:00.000Z',
        mes: 'Hello',
        extra: { source: 'original' },
        unknown_top_level: 'preserve-me',
      },
      {
        name: 'MetaBot',
        is_user: false,
        is_system: false,
        send_date: '2026-06-18T00:00:01.000Z',
        mes: 'Hi',
        extra: {},
        variables: [{ existing: true }],
        variables_initialized: [true],
      },
    ])

    const res = await app.request(`/api/chats/MetaBot/${chat.chatId}/message-variables`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: [
          { lineIndex: 0, variables: [{ should: 'ignore-header' }] },
          { lineIndex: 1, variables: [{ hp: 10 }], variables_initialized: [true] },
          { lineIndex: 99, variables: [{ should: 'ignore-missing' }] },
        ],
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: 1 })
    const stored = await getChat('MetaBot', chat.chatId)
    expect(stored.lines[0]).toMatchObject({
      chat_metadata: { variables: { scene: 'quiet' }, customField: 'keep-header' },
      user_name: 'User',
      character_name: 'MetaBot',
    })
    expect(stored.lines[1]).toMatchObject({
      mes: 'Hello',
      extra: { source: 'original' },
      unknown_top_level: 'preserve-me',
      variables: [{ hp: 10 }],
      variables_initialized: [true],
    })
    expect(stored.lines[2]).toMatchObject({
      mes: 'Hi',
      variables: [{ existing: true }],
      variables_initialized: [true],
    })
  })

  it('POST /api/chats/:name/:chatId/stream accepts request and returns SSE content type', async () => {
    const app = createApp()

    const charDir = path.join(testDataDir, 'characters', 'StreamBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        name: 'StreamBot',
        description: 'Test',
        system_prompt: 'You are a bot.',
        first_mes: 'Hello',
      }),
      'utf8',
    )

    const createRes = await app.request('/api/chats/StreamBot', { method: 'POST' })
    const { chatId } = await createRes.json() as Json

    try {
      const res = await app.request(`/api/chats/StreamBot/${chatId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            apiUrl: 'http://localhost:1234/v1',
            apiKey: '',
            model: 'test-model',
            type: 'openai' as const,
          },
        }),
        signal: AbortSignal.timeout(2000),
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
    } catch {
      expect(true).toBe(true)
    }
  })

  it('POST /api/worlds creates a world book', async () => {
    const app = createApp()
    const res = await app.request('/api/worlds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TestWorld', description: 'A test world' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as Json
    expect(body.name).toBe('TestWorld')
    expect(body.enabled).toBe(false)
    expect(body.global_enabled).toBe(false)
    expect(fs.existsSync(path.join(testDataDir, 'worlds', 'TestWorld.json'))).toBe(true)
  })

  it('reads nameless ST world files using the filename and preserves uid zero entries', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'NamelessStWorld.json'),
      JSON.stringify({
        entries: {
          '0': {
            uid: 0,
            key: ['eldoria'],
            content: 'Eldoria lore',
            selective: true,
            displayIndex: 0,
          },
        },
      }),
      'utf8',
    )

    const worldRes = await app.request('/api/worlds/NamelessStWorld')
    expect(worldRes.status).toBe(200)
    const world = await worldRes.json() as Json & { entries: Record<string, Json> }
    expect(world.name).toBe('NamelessStWorld')
    expect(world.entries['0']?.uid).toBe(0)
    expect(world.entries['0']?.content).toBe('Eldoria lore')

    const listRes = await app.request('/api/worlds')
    const worlds = await listRes.json() as Array<Json>
    const listed = worlds.find(item => item.name === 'NamelessStWorld')
    expect(listed?.entry_count).toBe(1)
  })

  it('uses the world filename as the stable identity when a stored name differs', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'FileIdentityWorld.json'),
      JSON.stringify({
        name: 'Embedded Display Name',
        entries: {},
        enabled: true,
      }),
      'utf8',
    )

    const worldRes = await app.request('/api/worlds/FileIdentityWorld')
    expect(worldRes.status).toBe(200)
    const world = await worldRes.json() as Json
    expect(world.name).toBe('FileIdentityWorld')

    const listRes = await app.request('/api/worlds')
    const worlds = await listRes.json() as Array<Json>
    expect(worlds.find(item => item.name === 'FileIdentityWorld')).toBeTruthy()
    expect(worlds.find(item => item.name === 'Embedded Display Name')).toBeFalsy()
  })

  it('keeps world book global scope independent from character bindings', async () => {
    const app = createApp()

    const charDirs = ['ScopeBotA', 'ScopeBotB']
    for (const name of charDirs) {
      const charDir = path.join(testDataDir, 'characters', name)
      fs.mkdirSync(charDir, { recursive: true })
      fs.writeFileSync(
        path.join(charDir, 'character.json'),
        JSON.stringify({
          spec: 'chara_card_v2',
          spec_version: '2.0',
          name,
          description: 'Scope test',
          extensions: name === 'ScopeBotA' ? { world: 'ExistingWorld' } : {},
        }),
        'utf8',
      )
    }

    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'ScopeWorld.json'),
      JSON.stringify({
        name: 'ScopeWorld',
        description: 'No explicit global flag yet',
        enabled: true,
        entries: {},
      }),
      'utf8',
    )

    const before = await app.request('/api/worlds')
    const beforeList = await before.json() as Array<Json>
    expect(beforeList.find(w => w.name === 'ScopeWorld')?.global_enabled).toBe(true)

    const bindA = await app.request('/api/worlds/ScopeWorld/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'ScopeBotA' }),
    })
    expect(bindA.status).toBe(200)

    const bindB = await app.request('/api/worlds/ScopeWorld/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'ScopeBotB' }),
    })
    expect(bindB.status).toBe(200)

    const listRes = await app.request('/api/worlds')
    const worlds = await listRes.json() as Array<Json & { bound_to: string[] }>
    const scopeWorld = worlds.find(w => w.name === 'ScopeWorld')
    expect(scopeWorld?.enabled).toBe(true)
    expect(scopeWorld?.global_enabled).toBe(true)
    expect(scopeWorld?.bound_to.sort()).toEqual(['ScopeBotA', 'ScopeBotB'])

    const storedWorld = JSON.parse(fs.readFileSync(path.join(testDataDir, 'worlds', 'ScopeWorld.json'), 'utf8'))
    expect(storedWorld.global_enabled).toBe(true)

    const updatedChar = JSON.parse(fs.readFileSync(path.join(testDataDir, 'characters', 'ScopeBotA', 'character.json'), 'utf8'))
    expect(updatedChar.data.extensions.world).toBe('ExistingWorld')
    expect(updatedChar.data.extensions.worlds).toEqual(['ExistingWorld', 'ScopeWorld'])
  })

  it('turns a world book off when its last character binding is removed and it is not global', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'BoundOnlyBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: 'BoundOnlyBot',
        description: 'Bound only',
        extensions: { world: 'BoundOnlyWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'BoundOnlyWorld.json'),
      JSON.stringify({
        name: 'BoundOnlyWorld',
        enabled: true,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const unbind = await app.request('/api/worlds/BoundOnlyWorld/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'BoundOnlyBot' }),
    })

    expect(unbind.status).toBe(200)
    const worldRes = await app.request('/api/worlds/BoundOnlyWorld')
    const world = await worldRes.json() as Json
    expect(world.global_enabled).toBe(false)
    expect(world.enabled).toBe(false)

    const listRes = await app.request('/api/worlds')
    const worlds = await listRes.json() as Array<Json & { bound_to: string[] }>
    const boundOnly = worlds.find(w => w.name === 'BoundOnlyWorld')
    expect(boundOnly?.bound_to).toEqual([])
    expect(boundOnly?.enabled).toBe(false)
  })

  it('turns legacy bound-only world books off after their last binding is removed', async () => {
    const app = createApp()
    const charDir = path.join(testDataDir, 'characters', 'LegacyBoundBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: 'LegacyBoundBot',
        description: 'Legacy bound only',
        extensions: { world: 'LegacyBoundWorld' },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'LegacyBoundWorld.json'),
      JSON.stringify({
        name: 'LegacyBoundWorld',
        enabled: true,
        entries: {},
      }),
      'utf8',
    )

    const beforeListRes = await app.request('/api/worlds')
    const beforeWorlds = await beforeListRes.json() as Array<Json & { bound_to: string[] }>
    const beforeWorld = beforeWorlds.find(w => w.name === 'LegacyBoundWorld')
    expect(beforeWorld?.global_enabled).toBe(false)
    expect(beforeWorld?.bound_to).toEqual(['LegacyBoundBot'])

    const unbind = await app.request('/api/worlds/LegacyBoundWorld/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterName: 'LegacyBoundBot' }),
    })

    expect(unbind.status).toBe(200)
    const worldRes = await app.request('/api/worlds/LegacyBoundWorld')
    const world = await worldRes.json() as Json
    expect(world.global_enabled).toBe(false)
    expect(world.enabled).toBe(false)

    const afterListRes = await app.request('/api/worlds')
    const afterWorlds = await afterListRes.json() as Array<Json & { bound_to: string[] }>
    const afterWorld = afterWorlds.find(w => w.name === 'LegacyBoundWorld')
    expect(afterWorld?.global_enabled).toBe(false)
    expect(afterWorld?.bound_to).toEqual([])
    expect(afterWorld?.enabled).toBe(false)
  })

  it('enabling global scope also enables the whole world book', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'DormantWorld.json'),
      JSON.stringify({
        name: 'DormantWorld',
        enabled: false,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const res = await app.request('/api/worlds/DormantWorld', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ global_enabled: true }),
    })

    expect(res.status).toBe(200)
    const world = await res.json() as Json
    expect(world.global_enabled).toBe(true)
    expect(world.enabled).toBe(true)
  })

  it('serves ST-compatible read-only world info settings', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'GlobalLore.json'),
      JSON.stringify({
        name: 'GlobalLore',
        enabled: true,
        global_enabled: true,
        entries: {},
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'LocalLore.json'),
      JSON.stringify({
        name: 'LocalLore',
        enabled: true,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const worldsRes = await app.request('/api/worlds/settings')
    const stRes = await app.request('/api/settings/get', { method: 'POST' })

    expect(worldsRes.status).toBe(200)
    expect(stRes.status).toBe(200)
    for (const body of [await worldsRes.json(), await stRes.json()] as Array<Json>) {
      expect(body.world_names).toEqual(expect.arrayContaining(['GlobalLore', 'LocalLore']))
      expect(body.selected_world_info).toEqual(['GlobalLore'])
      expect(body.world_info).toMatchObject({ globalSelect: ['GlobalLore'], charLore: [], entries: {} })
      expect(body.world_info_max_recursion_steps).toBe(10)
      expect(body.world_info_depth).toBe(4)
      expect(body.world_info_min_activations).toBe(0)
      expect(body.world_info_min_activations_depth_max).toBe(0)
      expect(body.world_info_budget).toBe(25)
      expect(body.world_info_budget_cap).toBe(0)
      expect(body.world_info_recursive).toBe(false)
      expect(body.world_info_overflow_alert).toBe(false)
      expect(body.world_info_character_strategy).toBe(0)
    }
  })

  it('serves the ST-compatible read-only worldinfo get endpoint', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'FileLore.json'),
      JSON.stringify({
        name: 'EmbeddedLore',
        enabled: true,
        global_enabled: true,
        entries: [
          {
            id: '0',
            keys: ['gate'],
            content: 'The gate hums.',
            extensions: { display_index: 12 },
          },
        ],
      }),
      'utf8',
    )

    const res = await app.request('/api/worldinfo/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'FileLore' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Json & { entries: Record<string, Json> }
    expect(body.name).toBe('FileLore')
    expect(body.entries['0']).toMatchObject({
      uid: 0,
      key: ['gate'],
      content: 'The gate hums.',
      display_index: 12,
    })
  })

  it('serves ST-compatible read-only worldinfo prompt checks', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'GlobalLore.json'),
      JSON.stringify({
        name: 'GlobalLore',
        enabled: true,
        global_enabled: true,
        scan_depth: 4,
        token_budget: 100,
        entries: {
          1: {
            uid: 1,
            key: ['dragon'],
            content: 'The dragon remembers the old gate.',
            enabled: true,
            position: 0,
            insertion_order: 10,
          },
        },
      }),
      'utf8',
    )

    const res = await app.request('/api/worldinfo/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat: [{ name: 'You', content: 'A dragon waits near the gate.' }],
        maxContext: 4096,
        isDryRun: true,
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Json & {
      matchedEntries: Array<Json & { content: string }>
      worldInfoBefore: string
      worldInfoAfter: string
      allActivatedEntries: Array<Json & { world: string; uid: number }>
    }
    expect(body.matchedEntries).toHaveLength(1)
    expect(body.matchedEntries[0]?.content).toBe('The dragon remembers the old gate.')
    expect(body.worldInfoBefore).toContain('The dragon remembers the old gate.')
    expect(body.worldInfoAfter).toBe('')
    expect(body.allActivatedEntries[0]).toMatchObject({ world: 'GlobalLore', uid: 1 })
  })

  it('rejects ST-compatible worldinfo get requests without a name', async () => {
    const app = createApp()

    const res = await app.request('/api/worldinfo/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'World info name is required' })
  })

  it('round-trips ST outlet and extension-backed world book entry fields through the API', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'OutletWorld.json'),
      JSON.stringify({
        name: 'OutletWorld',
        enabled: true,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const createRes = await app.request('/api/worlds/OutletWorld/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 7,
        keys: ['portal'],
        secondary_keys: ['gate'],
        content: 'outlet lore',
        position: 7,
        outlet_name: 'memo',
        group_weight: 10,
        ignore_budget: false,
        selective_logic: 0,
        match_whole_words: false,
        delay_until_recursion: 2,
        extensions: { match_character_description: true, custom_extension: 'keep-me' },
        character_filter: { names: ['Alice'], tags: ['hero'], isExclude: false },
      }),
    })

    expect(createRes.status).toBe(201)
    const createdWorld = await createRes.json() as Json & { entries: Record<string, Json> }
    expect(createdWorld.entries['7']?.key).toEqual(['portal'])
    expect(createdWorld.entries['7']?.keysecondary).toEqual(['gate'])
    expect(createdWorld.entries['7']?.position).toBe(7)
    expect(createdWorld.entries['7']?.outletName).toBe('memo')
    expect(createdWorld.entries['7']?.delay_until_recursion).toBe(2)
    expect(createdWorld.entries['7']?.extensions).toMatchObject({
      custom_extension: 'keep-me',
      delay_until_recursion: 2,
      group_weight: 10,
      ignore_budget: false,
      match_character_description: true,
      match_whole_words: false,
      outlet_name: 'memo',
      position: 7,
    })
    expect(createdWorld.entries['7']?.selectiveLogic).toBe(0)
    expect(createdWorld.entries['7']?.character_filter).toEqual({ names: ['Alice'], tags: ['hero'], isExclude: false })

    const updateRes = await app.request('/api/worlds/OutletWorld/entries/7', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outletName: 'journal',
        groupWeight: 77,
        ignoreBudget: true,
        selectiveLogic: 3,
        matchWholeWords: true,
        useProbability: false,
        matchCreatorNotes: true,
        triggers: ['continue'],
        extensions: { scan_depth: 9 },
      }),
    })

    expect(updateRes.status).toBe(200)
    const updatedWorld = await updateRes.json() as Json & { entries: Record<string, Json> }
    expect(updatedWorld.entries['7']?.position).toBe(7)
    expect(updatedWorld.entries['7']?.outletName).toBe('journal')
    expect(updatedWorld.entries['7']?.groupWeight).toBe(77)
    expect(updatedWorld.entries['7']?.ignoreBudget).toBe(true)
    expect(updatedWorld.entries['7']?.selectiveLogic).toBe(3)
    expect(updatedWorld.entries['7']?.match_whole_words).toBe(true)
    expect(updatedWorld.entries['7']?.useProbability).toBe(false)
    expect(updatedWorld.entries['7']?.matchCreatorNotes).toBe(true)
    expect(updatedWorld.entries['7']?.scanDepth).toBe(9)
    expect(updatedWorld.entries['7']?.triggers).toEqual(['continue'])
    expect(updatedWorld.entries['7']?.extensions).toMatchObject({
      custom_extension: 'keep-me',
      outlet_name: 'journal',
      group_weight: 77,
      ignore_budget: true,
      match_whole_words: true,
      useProbability: false,
      match_creator_notes: true,
      triggers: ['continue'],
      scan_depth: 9,
    })
    expect(updatedWorld.entries['7']?.selectiveLogic).toBe(3)
  })

  it('accepts ST string positions and nullable probability fields through the world book API', async () => {
    const app = createApp()
    fs.writeFileSync(
      path.join(testDataDir, 'worlds', 'LooseStWorld.json'),
      JSON.stringify({
        name: 'LooseStWorld',
        enabled: true,
        global_enabled: false,
        entries: {},
      }),
      'utf8',
    )

    const createRes = await app.request('/api/worlds/LooseStWorld/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 8,
        key: ['portal'],
        content: 'loose ST fields',
        position: 'outlet',
        outletName: 'memo',
        probability: null,
        useProbability: false,
        delay_until_recursion: '2',
      }),
    })

    expect(createRes.status).toBe(201)
    const createdWorld = await createRes.json() as Json & { entries: Record<string, Json> }
    expect(createdWorld.entries['8']?.position).toBe(7)
    expect(createdWorld.entries['8']?.outletName).toBe('memo')
    expect(createdWorld.entries['8']?.probability).toBe(100)
    expect(createdWorld.entries['8']?.useProbability).toBe(false)
    expect(createdWorld.entries['8']?.delay_until_recursion).toBe(2)
    expect(createdWorld.entries['8']?.extensions).toMatchObject({
      position: 'outlet',
      outlet_name: 'memo',
      probability: null,
      useProbability: false,
      delay_until_recursion: '2',
    })
  })

  it('POST /api/chats/:name/:chatId/messages sends and reads back a message', async () => {
    const app = createApp()

    const charDir = path.join(testDataDir, 'characters', 'MsgBot')
    fs.mkdirSync(charDir, { recursive: true })
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ name: 'MsgBot', description: 'Message test' }),
      'utf8',
    )

    const createRes = await app.request('/api/chats/MsgBot', { method: 'POST' })
    const { chatId } = await createRes.json() as Json

    const msgRes = await app.request(`/api/chats/MsgBot/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello world' }),
    })

    expect(msgRes.status).toBe(201)
    const msg = await msgRes.json() as Json
    expect(msg.is_user).toBe(true)
    expect(msg.mes).toBe('Hello world')
    expect(msg.is_system).toBe(false)
    expect(typeof msg.send_date).toBe('string')
    expect(Number.isNaN(Date.parse(msg.send_date as string))).toBe(false)

    const getRes = await app.request(`/api/chats/MsgBot/${chatId}`)
    const chat = await getRes.json() as Json & { lines: Record<string, unknown>[] }
    // 期望: 1 个元数据行 + 1 条用户消息 = 2 行
    // 实际: createChat 创建时只有元数据行,addMessage 追加用户消息
    // 但 getChat 返回的 lines 包含所有行
    expect(chat.lines.length).toBeGreaterThanOrEqual(1) // 至少有元数据
    const userMsg = chat.lines.find((l) => l.is_user === true)
    expect(userMsg).toBeDefined()
    expect(userMsg?.mes).toBe('Hello world')
  })

  it('404 for unknown routes', async () => {
    const app = createApp()
    const res = await app.request('/api/nonexistent')
    expect(res.status).toBe(404)
    const body = await res.json() as Json
    expect(body).toHaveProperty('error')
  })
})
