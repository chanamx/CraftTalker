export class Prompt {
  constructor(props = {}) {
    Object.assign(this, props)
  }
}

export class PromptCollection extends Array {
  add(prompt) {
    this.push(prompt)
    return prompt
  }
}

export class PromptManager {
  constructor() {
    this.collection = new PromptCollection()
  }

  getPromptCollection() {
    return this.collection
  }
}

export default PromptManager
