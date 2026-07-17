import {
  commitGeneratedMessage,
  finalizeGeneratedMessage,
  type GeneratedMessageCommitResult,
  type FinalizedMessageCommitResult,
} from './chat.service.js'

export interface CommitGenerationOutputInput {
  runId: string
  characterName: string
  chatId: string
  content: string
  isContinue: boolean
}

export type CommitGenerationOutputResult = GeneratedMessageCommitResult

export function commitGenerationOutput(input: CommitGenerationOutputInput): Promise<CommitGenerationOutputResult> {
  return commitGeneratedMessage(
    input.characterName,
    input.chatId,
    input.runId,
    input.content,
    input.isContinue,
  )
}

export interface FinalizeGenerationOutputInput {
  runId: string
  characterName: string
  chatId: string
  operation: 'generate' | 'regenerate' | 'continue'
  generatedContent: string
  finalizedContent: string
  committedLineIndex?: number
}

export type FinalizeGenerationOutputResult = FinalizedMessageCommitResult

export function finalizeGenerationOutput(input: FinalizeGenerationOutputInput): Promise<FinalizeGenerationOutputResult> {
  return finalizeGeneratedMessage(input)
}
