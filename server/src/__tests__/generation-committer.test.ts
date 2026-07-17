import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMessage,
  createChat,
  getChat,
} from '../services/chat.service.js'
import { ErrorCode } from '../lib/errors.js'
import { commitGenerationOutput, finalizeGenerationOutput } from '../services/generation-committer.js'

const dataDir = `${process.env.TEMP ?? process.env.TMP ?? '.'}/crafttalker-generation-committer-${crypto.randomUUID()}`

beforeEach(() => {
  process.env.LUKER_DATA_DIR = dataDir
})

afterEach(async () => {
  delete process.env.LUKER_DATA_DIR
  await import('node:fs/promises').then(fs => fs.rm(dataDir, { recursive: true, force: true }))
})

describe('generation committer', () => {
  it('commits a generated assistant message exactly once for repeated calls', async () => {
    const chat = await createChat('CommitBot')
    const runId = crypto.randomUUID()

    const first = await commitGenerationOutput({
      runId,
      characterName: 'CommitBot',
      chatId: chat.chatId,
      content: 'reply',
      isContinue: false,
    })
    const repeated = await commitGenerationOutput({
      runId,
      characterName: 'CommitBot',
      chatId: chat.chatId,
      content: 'reply',
      isContinue: false,
    })

    const stored = await getChat('CommitBot', chat.chatId)
    expect(stored.lines).toHaveLength(2)
    expect(first).toMatchObject({ lineIndex: 1, alreadyCommitted: false })
    expect(repeated).toMatchObject({ lineIndex: 1, alreadyCommitted: true })
    expect(stored.lines[1]).toMatchObject({
      mes: 'reply',
      extra: { crafttalker: { run_ids: [runId] } },
    })
  })

  it('appends a continue result once and preserves existing assistant extras', async () => {
    const chat = await createChat('ContinueCommitBot')
    await addMessage('ContinueCommitBot', chat.chatId, false, 'before', 'ContinueCommitBot', false, {
      plugin: { preserved: true },
    })
    const runId = crypto.randomUUID()

    await Promise.all([
      commitGenerationOutput({ runId, characterName: 'ContinueCommitBot', chatId: chat.chatId, content: ' after', isContinue: true }),
      commitGenerationOutput({ runId, characterName: 'ContinueCommitBot', chatId: chat.chatId, content: ' after', isContinue: true }),
    ])

    const stored = await getChat('ContinueCommitBot', chat.chatId)
    expect(stored.lines).toHaveLength(2)
    expect(stored.lines[1]).toMatchObject({
      mes: 'before after',
      extra: {
        plugin: { preserved: true },
        crafttalker: { run_ids: [runId] },
      },
    })
  })

  it('adds a second run marker without destroying the first marker', async () => {
    const chat = await createChat('MarkerBot')
    const firstRunId = crypto.randomUUID()
    const secondRunId = crypto.randomUUID()

    await commitGenerationOutput({ runId: firstRunId, characterName: 'MarkerBot', chatId: chat.chatId, content: 'one', isContinue: false })
    await commitGenerationOutput({ runId: secondRunId, characterName: 'MarkerBot', chatId: chat.chatId, content: ' two', isContinue: true })

    const stored = await getChat('MarkerBot', chat.chatId)
    expect(stored.lines[1]).toMatchObject({
      mes: 'one two',
      extra: { crafttalker: { run_ids: [firstRunId, secondRunId] } },
    })
  })

  it('rejects a run marker attached to a non-assistant line', async () => {
    const chat = await createChat('UserMarkerBot')
    const runId = crypto.randomUUID()
    await addMessage('UserMarkerBot', chat.chatId, true, 'user text', 'user', false, {
      crafttalker: { run_ids: [runId] },
    })

    await expect(commitGenerationOutput({
      runId,
      characterName: 'UserMarkerBot',
      chatId: chat.chatId,
      content: 'reply',
      isContinue: false,
    })).rejects.toMatchObject({ code: ErrorCode.CONFLICT })
  })

  it('rejects a run marker duplicated across assistant lines', async () => {
    const chat = await createChat('DuplicateMarkerBot')
    const runId = crypto.randomUUID()
    const extra = { crafttalker: { run_ids: [runId] } }
    await addMessage('DuplicateMarkerBot', chat.chatId, false, 'first', 'DuplicateMarkerBot', false, extra)
    await addMessage('DuplicateMarkerBot', chat.chatId, false, 'second', 'DuplicateMarkerBot', false, extra)

    await expect(commitGenerationOutput({
      runId,
      characterName: 'DuplicateMarkerBot',
      chatId: chat.chatId,
      content: 'reply',
      isContinue: false,
    })).rejects.toMatchObject({ code: ErrorCode.CONFLICT })
  })

  it('finalizes a marked continue suffix exactly once and preserves extras', async () => {
    const chat = await createChat('FinalizeContinueBot')
    await addMessage('FinalizeContinueBot', chat.chatId, false, 'before', 'FinalizeContinueBot', false, {
      plugin: { preserved: true },
    })
    const runId = crypto.randomUUID()
    const committed = await commitGenerationOutput({
      runId,
      characterName: 'FinalizeContinueBot',
      chatId: chat.chatId,
      content: ' raw suffix',
      isContinue: true,
    })

    const input = {
      runId,
      characterName: 'FinalizeContinueBot',
      chatId: chat.chatId,
      operation: 'continue' as const,
      generatedContent: ' raw suffix',
      finalizedContent: ' final suffix',
      committedLineIndex: committed.lineIndex,
    }
    const first = await finalizeGenerationOutput(input)
    const repeated = await finalizeGenerationOutput(input)

    expect(first.alreadyFinalized).toBe(false)
    expect(repeated.alreadyFinalized).toBe(true)
    expect((await getChat('FinalizeContinueBot', chat.chatId)).lines[1]).toMatchObject({
      mes: 'before final suffix',
      extra: {
        plugin: { preserved: true },
        crafttalker: {
          run_ids: [runId],
          st_finalized_run_ids: [runId],
        },
      },
    })
  })

  it('creates one marked assistant line when repeated finalization content is empty', async () => {
    const chat = await createChat('FinalizeEmptyBot')
    const runId = crypto.randomUUID()
    const input = {
      runId,
      characterName: 'FinalizeEmptyBot',
      chatId: chat.chatId,
      operation: 'generate' as const,
      generatedContent: '',
      finalizedContent: '',
    }

    await finalizeGenerationOutput(input)
    await finalizeGenerationOutput(input)

    const stored = await getChat('FinalizeEmptyBot', chat.chatId)
    expect(stored.lines).toHaveLength(2)
    expect(stored.lines[1]).toMatchObject({
      mes: '',
      extra: {
        crafttalker: {
          run_ids: [runId],
          st_finalized_run_ids: [runId],
        },
      },
    })
  })
})
