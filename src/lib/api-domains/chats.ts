import { API_BASE, request } from '@/lib/api-client'
import type {
  ChatDetail,
  ChatGenerationRequestOptions,
  ChatInfo,
  ChatLine,
  ChatMetadataUpdateResponse,
  ChatMessageVariablesUpdate,
  ChatMessageVariablesUpdateResponse,
  LlmRequestConfig,
} from '@/lib/api-types'

function streamRequest(
  path: string,
  config: LlmRequestConfig,
  options: ChatGenerationRequestOptions = {},
): Promise<Response> {
  const { presetType, presetName, signal, genOverrides, stCompat } = options
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      presetType,
      presetName,
      genOverrides,
      stCompatChatOverride: stCompat?.chatOverride,
      stCompatExtensionPrompts: stCompat?.extensionPrompts,
      stCompatPromptMessages: stCompat?.promptMessages,
    }),
    signal,
  })
}

function chatPath(characterName: string, chatId: string): string {
  return `/chats/${encodeURIComponent(characterName)}/${encodeURIComponent(chatId)}`
}

export const chatsApi = {
  list: (characterName: string) =>
    request<ChatInfo[]>(`/chats/${encodeURIComponent(characterName)}`),
  get: (characterName: string, chatId: string) =>
    request<ChatDetail>(chatPath(characterName, chatId)),
  create: (characterName: string, userName?: string) =>
    request<ChatDetail>(`/chats/${encodeURIComponent(characterName)}`, {
      method: 'POST',
      body: JSON.stringify({ userName }),
    }),
  sendMessage: (characterName: string, chatId: string, content: string) =>
    request<ChatLine>(`/chats/${encodeURIComponent(characterName)}/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  generate: (
    characterName: string,
    chatId: string,
    config: LlmRequestConfig,
    options?: ChatGenerationRequestOptions,
  ) =>
    streamRequest(
      `${chatPath(characterName, chatId)}/stream`,
      config,
      options,
    ),
  regenerate: (
    characterName: string,
    chatId: string,
    config: LlmRequestConfig,
    options?: ChatGenerationRequestOptions,
  ) =>
    streamRequest(
      `${chatPath(characterName, chatId)}/regenerate`,
      config,
      options,
    ),
  continue: (
    characterName: string,
    chatId: string,
    config: LlmRequestConfig,
    options?: ChatGenerationRequestOptions,
  ) =>
    streamRequest(
      `${chatPath(characterName, chatId)}/continue`,
      config,
      options,
    ),
  delete: (characterName: string, chatId: string) =>
    request<{ success: boolean }>(chatPath(characterName, chatId), {
      method: 'DELETE',
    }),
  deleteMessage: (characterName: string, chatId: string, lineIndex: number) =>
    request<{ success: boolean }>(`${chatPath(characterName, chatId)}/messages/${lineIndex}`, {
      method: 'DELETE',
    }),
  editMessage: (characterName: string, chatId: string, lineIndex: number, content: string) =>
    request<ChatLine>(`${chatPath(characterName, chatId)}/messages/${lineIndex}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  updateMetadata: (characterName: string, chatId: string, chatMetadata: Record<string, unknown>) =>
    request<ChatMetadataUpdateResponse>(`${chatPath(characterName, chatId)}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify({ chat_metadata: chatMetadata }),
    }),
  updateMessageVariables: (
    characterName: string,
    chatId: string,
    updates: ChatMessageVariablesUpdate[],
  ) =>
    request<ChatMessageVariablesUpdateResponse>(`${chatPath(characterName, chatId)}/message-variables`, {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    }),
  rename: (characterName: string, chatId: string, chatName: string) =>
    request<{ success: boolean }>(chatPath(characterName, chatId), {
      method: 'PATCH',
      body: JSON.stringify({ chatName }),
    }),
  switchSwipe: (characterName: string, chatId: string, lineIndex: number, swipeId: number) =>
    request<ChatLine>(`${chatPath(characterName, chatId)}/messages/${lineIndex}/swipe`, {
      method: 'POST',
      body: JSON.stringify({ swipeId }),
    }),
}
