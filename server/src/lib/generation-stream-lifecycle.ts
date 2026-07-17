const DEFAULT_MAX_STREAM_LIFETIME_MS = 180_000
const DEFAULT_SHUTDOWN_GRACE_MS = 2_000

export class GenerationStreamLifecycle {
  private readonly controller = new AbortController()
  readonly signal: AbortSignal

  constructor(
    clientSignal?: AbortSignal,
    maxLifetimeMs = DEFAULT_MAX_STREAM_LIFETIME_MS,
    private readonly shutdownGraceMs = DEFAULT_SHUTDOWN_GRACE_MS,
  ) {
    const signals = [
      this.controller.signal,
      AbortSignal.timeout(Math.max(1_000, Math.floor(maxLifetimeMs))),
    ]
    if (clientSignal) signals.push(clientSignal)
    this.signal = AbortSignal.any(signals)
  }

  async cancelGenerator(
    generator: AsyncGenerator<unknown, void, unknown>,
    reason: unknown = 'Generation stream canceled',
  ): Promise<void> {
    if (!this.controller.signal.aborted) this.controller.abort(reason)

    await Promise.race([
      generator.return().then(() => undefined).catch(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, this.shutdownGraceMs)),
    ])
  }
}
