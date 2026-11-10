import { useStore } from '../store'
import { chatJson, progressHint } from './client'
import { featuresPrompt, featuresToOps, flowsPrompt, flowsToOps, layoutPrompt, layoutToOps, sitemapPrompt, sitemapToOps, STEPS, type StepKey } from './prompts'
import { relayout } from '../flow/relayout'
import type { PatchOp } from '../model/types'

let controller: AbortController | null = null

export function cancelAi() {
  controller?.abort()
  controller = null
  useStore.getState().setBusy(null)
}

function begin(label: string) {
  controller?.abort()
  controller = new AbortController()
  useStore.getState().setBusy(label)
  return controller.signal
}

function commit(ops: PatchOp[], step: number) {
  const st = useStore.getState()
  const errs = st.patch(ops)
  st.update((p) => ({ ...p, guideStep: Math.max(p.guideStep, step) }), false)
  return errs
}

/** Run one guided step. Returns a short status message. */
export async function runStep(key: StepKey, opts: { screenIds?: string[] } = {}): Promise<string> {
  const st = useStore.getState()
  const ai = st.ai
  const n = STEPS.find((s) => s.key === key)!.n
  const label = `第 ${n} 步：${STEPS[n - 1].name}`
  const signal = begin(label)
  const onProgress = (t: string) => useStore.getState().setBusy(`${label} · 已收到 ${progressHint(t)}`)
  try {
    if (key === 'features') {
      const ops = await chatJson(ai, featuresPrompt(st.project()), featuresToOps, { signal, onProgress })
      commit(ops, 1)
      return `已生成 ${useStore.getState().project().features.length} 个功能点`
    }
    if (key === 'sitemap') {
      // regenerating the structure replaces pages and everything that depends on them
      const p = { ...st.project(), screens: [], transitions: [], conditions: [], entryId: undefined }
      const ops = await chatJson(ai, sitemapPrompt(p), (v) => sitemapToOps(v, p), { signal, onProgress })
      useStore.getState().update((x) => ({ ...x, screens: [], transitions: [], conditions: [], positions: {}, entryId: undefined, guideStep: Math.min(x.guideStep, 1) }))
      const errs = commit(ops, 2)
      await relayout()
      return `页面结构已更新（${useStore.getState().project().screens.length} 个节点）${errs.length ? `，${errs.length} 处被跳过` : ''}`
    }
    if (key === 'flows') {
      // regenerate from a clean graph so repeated runs don't pile up edges
      const base = { ...st.project(), transitions: [], conditions: [] }
      const ops = await chatJson(ai, flowsPrompt(base), (v) => flowsToOps(v, base), { signal, onProgress, maxTokens: 12000 })
      useStore.getState().update((x) => {
        const positions = { ...x.positions }
        for (const c of x.conditions) delete positions[c.id]
        return { ...x, transitions: [], conditions: [], positions, guideStep: Math.min(x.guideStep, 2) }
      })
      const errs = commit(ops, 3)
      await relayout()
      return `新增 ${ops.length - errs.length} 条交互${errs.length ? `，${errs.length} 处无效已跳过` : ''}`
    }
    // layouts: one request per screen, a few in parallel
    const p = st.project()
    const targets = p.screens.filter((s) => !opts.screenIds || opts.screenIds.includes(s.id))
    let done = 0
    let failed = 0
    const queue = [...targets]
    const active = new Set<string>()
    const show = () => useStore.getState().setBusy(`第 4 步：生成布局 · 已完成 ${done + failed}/${targets.length}${active.size ? ` · 正在生成 ${[...active].join('、')}` : ''}`)
    const worker = async () => {
      while (queue.length) {
        if (signal.aborted) return
        const s = queue.shift()!
        active.add(s.name)
        show()
        try {
          const cur = useStore.getState().project()
          const allowed = cur.screens.find((x) => x.id === s.id)?.states.map((x) => x.id) ?? []
          const ops = await chatJson(ai, layoutPrompt(cur, s.id), (v) => layoutToOps(v, s.id, allowed), { signal, maxTokens: 12000 })
          commit(ops, 3)
          done++
        } catch (e) {
          if (signal.aborted) return
          console.warn('layout failed', s.id, e)
          failed++
        } finally {
          active.delete(s.name)
          show()
        }
      }
    }
    // the gateway handles parallel requests well; per-request latency dominates
    await Promise.all(Array.from({ length: Math.min(5, targets.length) }, worker))
    if (done && targets.length === p.screens.length) useStore.getState().update((x) => ({ ...x, guideStep: Math.max(x.guideStep, 4) }), false)
    return `已生成 ${done} 个页面的布局${failed ? `，${failed} 个失败（可单独重试）` : ''}`
  } finally {
    if (controller?.signal === signal) {
      controller = null
      useStore.getState().setBusy(null)
    }
  }
}

/** Run every remaining step in order. */
export async function runAll(): Promise<string> {
  const msgs: string[] = []
  const start = useStore.getState().project().guideStep
  for (const s of STEPS) {
    if (s.n <= start) continue
    // errors (including cancel) propagate and stop the chain
    msgs.push(await runStep(s.key))
  }
  return msgs.join('；')
}

export { begin as beginAi }
