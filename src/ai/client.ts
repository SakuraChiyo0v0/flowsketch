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

export interface ChatOpts {
  signal?: AbortSignal
  maxTokens?: number
  /** called with the text received so far (streaming) */
  onProgress?: (partial: string) => void
}

export async function chat(ai: AiSettings, messages: ChatMsg[], opts: ChatOpts = {}): Promise<string> {
  const url = `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}) },
    body: JSON.stringify({ model: ai.model, messages, temperature: 0.4, max_tokens: opts.maxTokens ?? 8000, stream: true }),
    signal: opts.signal,
  })
  if (!res.ok) {
    const raw = await res.text()
    let msg = raw.slice(0, 300)
    try {
      msg = JSON.parse(raw).error?.message ?? msg
    } catch {
      /* keep raw */
    }
    throw new AiError(`AI 请求失败 (${res.status})：${msg}`)
  }
  const ctype = res.headers.get('content-type') ?? ''
  // some gateways ignore stream:true and answer with a normal JSON body
  if (!ctype.includes('event-stream') || !res.body) {
    const data = JSON.parse(await res.text())
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new AiError('AI 返回了空内容')
    return content
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let out = ''
  let finish: string | null = null
  let lastTick = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        if (j.error) throw new AiError(`AI 出错：${j.error.message ?? JSON.stringify(j.error)}`)
        const ch = j.choices?.[0]
        if (ch?.delta?.content) out += ch.delta.content
        if (ch?.finish_reason) finish = ch.finish_reason
      } catch (e) {
        if (e instanceof AiError) throw e
        /* ignore keep-alives and partial lines */
      }
    }
    const now = Date.now()
    if (opts.onProgress && now - lastTick > 250) {
      lastTick = now
      opts.onProgress(out)
    }
  }
  opts.onProgress?.(out)
  if (!out.trim()) throw new AiError('AI 返回了空内容')
  if (finish === 'length') throw new AiError('AI 输出超出长度上限被截断，请缩小修改范围后重试')
  return out
}

/** Rough progress text: how many top-level items of `key` arrays have appeared so far. */
export function progressHint(partial: string): string {
  const kb = (partial.length / 1000).toFixed(1)
  const counts: string[] = []
  const name = (re: RegExp, label: string) => {
    const n = (partial.match(re) ?? []).length
    if (n) counts.push(`${n} ${label}`)
  }
  name(/"op"\s*:/g, '项修改')
  name(/"from"\s*:/g, '条连线')
  name(/"kind"\s*:\s*"(?:page|overlay)"/g, '个页面')
  name(/"type"\s*:/g, '个元素')
  return counts.length ? `${counts[0]} · ${kb}k` : `${kb}k 字符`
}

/** Ask for JSON; if parsing or validation fails, feed the error back once and retry. */
export async function chatJson<T>(ai: AiSettings, messages: ChatMsg[], validate: (v: unknown) => T, opts: ChatOpts = {}): Promise<T> {
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
