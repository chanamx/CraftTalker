export class v1CharData {
  constructor(data = {}) {
    Object.assign(this, data)
  }
}

export class RegexScriptData {
  constructor(data = {}) {
    Object.assign(this, {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      scriptName: '',
      findRegex: '',
      replaceString: '',
      trimStrings: [],
      placement: [],
      disabled: false,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    }, data)
  }
}

export const defaultCharacterData = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
}

export default {
  v1CharData,
  RegexScriptData,
  defaultCharacterData,
}
