import type { AiSettings } from '../store'

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class AiError extends Error {}

/** Extract the first JSON object/array from model output (tolerates ```json fences and prose). */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : text
  const start = body.search(/[{[]/)
  if (start < 0) throw new AiError('模型没有返回 JSON')
  // scan for the matching bracket, respecting strings
  const open = body[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let escNext = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inStr) {
      if (escNext) escNext = false
      else if (ch === '\\') escNext = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return JSON.parse(body.slice(start, i + 1))
    }
  }
  throw new AiError('模型输出的 JSON 不完整（可能被截断）')
}

export async function chat(ai: AiSettings, messages: ChatMsg[], opts: { signal?: AbortSignal; maxTokens?: number } = {}): Promise<string> {
  const url = `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}) },
    body: JSON.stringify({ model: ai.model, messages, temperature: 0.4, max_tokens: opts.maxTokens ?? 8000 }),
    signal: opts.signal,
  })
  const raw = await res.text()
  if (!res.ok) {
    let msg = raw.slice(0, 300)
    try {
      msg = JSON.parse(raw).error?.message ?? msg
    } catch {
      /* keep raw */
    }
    throw new AiError(`AI 请求失败 (${res.status})：${msg}`)
  }
  const data = JSON.parse(raw)
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new AiError('AI 返回了空内容')
  return content
}

/** Ask for JSON; if parsing or validation fails, feed the error back once and retry. */
export async function chatJson<T>(ai: AiSettings, messages: ChatMsg[], validate: (v: unknown) => T, opts: { signal?: AbortSignal; maxTokens?: number } = {}): Promise<T> {
  let msgs = messages
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chat(ai, msgs, opts)
    try {
      return validate(extractJson(text))
    } catch (e) {
      lastErr = e
      msgs = [...msgs, { role: 'assistant', content: text.slice(0, 6000) }, { role: 'user', content: `你的输出无法解析：${(e as Error).message}。请只输出一个合法的 JSON，不要任何解释。` }]
    }
  }
  throw lastErr instanceof Error ? lastErr : new AiError('无法解析 AI 输出')
}
