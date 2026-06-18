import { getHost } from '../host.js'
import { SlashCommandEnumValue } from './SlashCommandEnumValue.js'

export const commonEnumProviders = {
  boolean: () => () => [
    new SlashCommandEnumValue('on', 'Enable'),
    new SlashCommandEnumValue('off', 'Disable'),
    new SlashCommandEnumValue('true', 'True'),
    new SlashCommandEnumValue('false', 'False'),
  ],
  enum: values => () => values,
}

export const enumIcons = {}
export const ARGUMENT_TYPE = getHost().ARGUMENT_TYPE
export default commonEnumProviders
