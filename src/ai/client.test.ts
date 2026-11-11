import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError, chat } from './client'

const ai = { baseUrl: 'http://x', apiKey: '', model: 'm' } as never

const sse = (text: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

// run timers instantly so backoff doesn't slow the test
vi.stubGlobal('window', { setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => {} })

afterEach(() => vi.unstubAllGlobals())

describe('chat retries', () => {
  it('retries a 502 and then succeeds', async () => {
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => {} })
    const calls: number[] = []
    vi.stubGlobal('fetch', async () => {
      calls.push(1)
      return calls.length === 1 ? new Response('{"error":{"message":"[Kiro] Client network socket disconnected before secure TLS connection was established"}}', { status: 502 }) : sse('ok')
    })
    const retries: number[] = []
    const out = await chat(ai, [{ role: 'user', content: 'hi' }], { onRetry: (n) => retries.push(n) })
    expect(out).toBe('ok')
    expect(calls.length).toBe(2)
    expect(retries).toEqual([1])
  })

  it('retries network errors (fetch TypeError)', async () => {
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => {} })
    let n = 0
    vi.stubGlobal('fetch', async () => {
      if (++n < 3) throw new TypeError('Failed to fetch')
      return sse('ok')
    })
    expect(await chat(ai, [{ role: 'user', content: 'hi' }])).toBe('ok')
    expect(n).toBe(3)
  })

  it('does not retry 4xx', async () => {
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => {} })
    let n = 0
    vi.stubGlobal('fetch', async () => {
      n++
      return new Response('{"error":{"message":"bad key"}}', { status: 401 })
    })
    await expect(chat(ai, [{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(AiError)
    expect(n).toBe(1)
  })

  it('gives up after 3 retries', async () => {
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => {} })
    let n = 0
    vi.stubGlobal('fetch', async () => {
      n++
      return new Response('upstream down', { status: 503 })
    })
    await expect(chat(ai, [{ role: 'user', content: 'hi' }])).rejects.toThrow('503')
    expect(n).toBe(4)
  })
})
