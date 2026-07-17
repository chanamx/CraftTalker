import type { Engine } from './types.js'
import { NativeEngine } from './native.js'

let currentEngine: Engine = new NativeEngine()

export function getEngine(): Engine {
  return currentEngine
}

export function setEngine(engine: Engine): void {
  currentEngine = engine
}

export function getEngineName(): string {
  return currentEngine.name
}

export { NativeEngine } from './native.js'
export type { Engine, EngineRequest, EngineResponse, EngineMessage, EnginePromptAnchors } from './types.js'
