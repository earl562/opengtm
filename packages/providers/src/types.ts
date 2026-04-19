/**
 * Public contract for any LLM provider the OpenGTM harness talks to.
 *
 * This interface is deliberately minimal. The Externalization paper (Zhang et al.
 * arXiv:2604.08224) frames the model as the inner layer of a harnessed system;
 * everything else — routing, failover, cost accounting, caching, rate limiting —
 * is user-land concern that composes AROUND this interface, not inside it.
 *
 * Keep this surface stable. Any provider capable of turning a prompt into text
 * with token accounting can implement it.
 */

export interface OpenGtmGenerateInput {
  /** Optional system message / instructions. */
  system?: string
  /** User prompt. Required. */
  prompt: string
  /** Sampling temperature. Provider default if omitted. */
  temperature?: number
  /** Hard cap on output tokens. Provider default if omitted. */
  maxTokens?: number
}

export interface OpenGtmGenerateOutput {
  /** Generated text (assistant message content). */
  text: string
  /** Model identifier the provider reports having used. */
  model: string
  /** Token accounting reported by the provider. Zero if unavailable. */
  tokens: {
    input: number
    output: number
  }
  /**
   * Optional cost estimate in USD.
   * The harness does NOT compute this — providers that track pricing may set it,
   * otherwise consumers treat it as unknown.
   */
  costUsd?: number
}

export interface OpenGtmProvider {
  /** Stable identifier. Used in traces and logs. */
  id: string
  /** One-shot generation. Streaming variants belong on separate interfaces. */
  generate(input: OpenGtmGenerateInput): Promise<OpenGtmGenerateOutput>
}
