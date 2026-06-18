import { getHost } from './host.js'

const host = getHost()

export const ARGUMENT_TYPE = host.ARGUMENT_TYPE
export const SlashCommand = host.SlashCommand
export const SlashCommandArgument = host.SlashCommandArgument
export const SlashCommandNamedArgument = host.SlashCommandNamedArgument
export const SlashCommandEnumValue = host.SlashCommandEnumValue
export const SlashCommandClosure = host.SlashCommandClosure
export const SlashCommandParser = host.SlashCommandParser
export const executeSlashCommands = (...args) => host.executeSlashCommands(...args)
export const executeSlashCommandsWithOptions = (input = '', options = {}) =>
  host.executeSlashCommandsWithOptions(input, { ...options, returnResultObject: true })
export const registerSlashCommand = host.registerSlashCommand

export default {
  ARGUMENT_TYPE,
  SlashCommand,
  SlashCommandArgument,
  SlashCommandNamedArgument,
  SlashCommandEnumValue,
  SlashCommandClosure,
  SlashCommandParser,
  executeSlashCommands,
  executeSlashCommandsWithOptions,
  registerSlashCommand,
}
