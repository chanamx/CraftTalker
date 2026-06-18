import { getHost } from '../host.js'

export const SlashCommandParser = getHost().SlashCommandParser
export const PARSER_FLAG = {
  STRICT_ESCAPING: 1,
  REPLACE_GETVAR: 2,
}
export default SlashCommandParser
