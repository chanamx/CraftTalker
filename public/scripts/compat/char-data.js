export class v1CharData {
  constructor(data = {}) {
    Object.assign(this, data)
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
  defaultCharacterData,
}
