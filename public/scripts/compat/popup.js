export const POPUP_TYPE = {
  TEXT: 'text',
  CONFIRM: 'confirm',
  INPUT: 'input',
}

export const POPUP_RESULT = {
  AFFIRMATIVE: 1,
  NEGATIVE: 0,
  CANCELLED: null,
}

export class Popup {
  constructor(content = '', type = POPUP_TYPE.TEXT) {
    this.content = content
    this.type = type
  }

  async show() {
    return POPUP_RESULT.AFFIRMATIVE
  }
}

export async function callGenericPopup(content, type = POPUP_TYPE.TEXT) {
  if (type === POPUP_TYPE.CONFIRM) return window.confirm(String(content ?? ''))
  window.alert(String(content ?? ''))
  return POPUP_RESULT.AFFIRMATIVE
}

export async function callPopup(content, type = POPUP_TYPE.TEXT) {
  return callGenericPopup(content, type)
}

export default {
  POPUP_TYPE,
  POPUP_RESULT,
  Popup,
  callGenericPopup,
  callPopup,
}
