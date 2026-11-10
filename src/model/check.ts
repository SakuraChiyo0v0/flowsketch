import { findElement } from './elements'
import type { PatchOp, Project } from './types'
import { DEFAULT_STATE } from './types'

export type IssueLevel = 'error' | 'warning' | 'info'

export interface Issue {
  id: string
  level: IssueLevel
  title: string
  detail: string
  targetId?: string
  /** deterministic fix, when one exists */
  fix?: { label: string; ops: PatchOp[] }
  /** ask AI to fix with this instruction */
  aiFix?: string
}

/** Structural checks over the flow graph. Pure function, no AI. */
export function checkProject(p: Project): Issue[] {
  const issues: Issue[] = []
  const screenIds = new Set(p.screens.map((s) => s.id))
  const allIds = new Set([...screenIds, ...p.conditions.map((c) => c.id)])
  const name = (id: string) => p.screens.find((s) => s.id === id)?.name ?? p.conditions.find((c) => c.id === id)?.label ?? id

  if (p.screens.length === 0) return issues

  const entry = p.entryId && screenIds.has(p.entryId) ? p.entryId : undefined
  if (!entry) {
    const first = p.screens.find((s) => s.kind === 'page')
    issues.push({
      id: 'no-entry',
      level: 'error',
      title: '没有设置入口页',
      detail: '用户打开应用时看到哪个页面不明确。',
      fix: first ? { label: `设为「${first.name}」`, ops: [{ op: 'setEntry', id: first.id }] } : undefined,
    })
  }

  // dangling edges
  for (const t of p.transitions) {
    if (!allIds.has(t.from) || !allIds.has(t.to)) {
      issues.push({
        id: `dangling-${t.id}`,
        level: 'error',
        title: '连线指向不存在的节点',
        detail: `${name(t.from)} → ${name(t.to)}`,
        fix: { label: '删除连线', ops: [{ op: 'removeTransition', id: t.id }] },
      })
    }
  }

  const out = new Map<string, number>()
  const inc = new Map<string, number>()
  for (const t of p.transitions) {
    out.set(t.from, (out.get(t.from) ?? 0) + 1)
    inc.set(t.to, (inc.get(t.to) ?? 0) + 1)
  }

  // reachability from entry (overlays reachable via open; conditions pass through)
  if (entry) {
    const seen = new Set<string>([entry])
    const stack = [entry]
    while (stack.length) {
      const cur = stack.pop()!
      for (const t of p.transitions) {
        if (t.from === cur && !seen.has(t.to)) {
          seen.add(t.to)
          stack.push(t.to)
        }
      }
    }
    for (const s of p.screens) {
      if (!seen.has(s.id)) {
        issues.push({
          id: `unreachable-${s.id}`,
          level: 'warning',
          title: `「${s.name}」无法到达`,
          detail: '从入口页出发，没有任何路径能走到这个页面。',
          targetId: s.id,
          aiFix: `「${s.name}」(id: ${s.id}) 从入口页无法到达，请补充合理的入口连线。`,
        })
      }
    }
  }

  for (const s of p.screens) {
    const o = out.get(s.id) ?? 0
    if (s.kind === 'overlay') {
      const closes = p.transitions.some((t) => t.from === s.id)
      if (!closes) {
        issues.push({
          id: `overlay-noclose-${s.id}`,
          level: 'warning',
          title: `浮层「${s.name}」没有关闭方式`,
          detail: '弹窗/抽屉打开后用户无法关闭或离开。',
          targetId: s.id,
          fix: {
            label: '添加「关闭」',
            ops: [{ op: 'addTransition', transition: { from: s.id, to: s.id, action: 'close', trigger: 'tap', label: '关闭', kind: 'back' } }],
          },
        })
      }
      continue
    }
    if (o === 0 && s.id !== entry) {
      issues.push({
        id: `deadend-${s.id}`,
        level: 'warning',
        title: `「${s.name}」没有出口`,
        detail: '进入这个页面后无法返回或继续，用户会卡住。',
        targetId: s.id,
        fix: entry
          ? { label: '添加「返回首页」', ops: [{ op: 'addTransition', transition: { from: s.id, to: entry, label: '返回首页', kind: 'back', action: 'navigate' } }] }
          : undefined,
        aiFix: `「${s.name}」(id: ${s.id}) 没有出口，请补充返回或继续的连线。`,
      })
    }
    // states defined but never entered
    for (const st of s.states) {
      if (st.id === DEFAULT_STATE) continue
      const entered = p.transitions.some((t) => t.to === s.id && t.toState === st.id) || p.transitions.some((t) => t.from === s.id && t.action === 'setState' && t.toState === st.id)
      if (!entered) {
        issues.push({
          id: `state-orphan-${s.id}-${st.id}`,
          level: 'info',
          title: `状态「${s.name} · ${st.name}」没有进入条件`,
          detail: '定义了这个状态，但流程里没有说明什么情况下会出现它。',
          targetId: s.id,
          aiFix: `「${s.name}」的状态「${st.name}」(stateId: ${st.id}) 没有进入它的连线，请补充触发条件（可以通过判断节点）。`,
        })
      }
      // error states should have a way out
      const leaves = p.transitions.some((t) => t.from === s.id && t.fromState === st.id)
      if (/失败|错误|error|fail/i.test(st.name + st.id) && !leaves) {
        issues.push({
          id: `state-noexit-${s.id}-${st.id}`,
          level: 'warning',
          title: `「${s.name} · ${st.name}」没有恢复路径`,
          detail: '出错后用户只能停在这里，应提供重试或取消。',
          targetId: s.id,
          fix: {
            label: '添加「重试」',
            ops: [{ op: 'addTransition', transition: { from: s.id, fromState: st.id, to: s.id, label: '重试', action: 'setState', toState: DEFAULT_STATE, kind: 'back' } }],
          },
        })
      }
    }
    // element references
    for (const t of p.transitions) {
      if (t.from !== s.id || !t.elementId) continue
      const state = s.states.find((x) => x.id === (t.fromState ?? DEFAULT_STATE))
      if (state && !findElement(state.root, t.elementId)) {
        issues.push({
          id: `elref-${t.id}`,
          level: 'info',
          title: '连线绑定的元素已不存在',
          detail: `${s.name} → ${name(t.to)}${t.label ? `「${t.label}」` : ''}`,
          targetId: s.id,
          fix: { label: '解除绑定', ops: [{ op: 'updateTransition', id: t.id, changes: { elementId: undefined } }] },
        })
      }
    }
  }

  for (const c of p.conditions) {
    const outs = p.transitions.filter((t) => t.from === c.id)
    if ((inc.get(c.id) ?? 0) === 0) {
      issues.push({
        id: `cond-noin-${c.id}`,
        level: 'warning',
        title: `判断「${c.label}」没有输入`,
        detail: '没有任何流程会走到这个判断。',
        targetId: c.id,
        fix: { label: '删除判断', ops: [{ op: 'removeCondition', id: c.id }] },
      })
    }
    if (outs.length < 2) {
      issues.push({
        id: `cond-branches-${c.id}`,
        level: 'warning',
        title: `判断「${c.label}」只有 ${outs.length} 个分支`,
        detail: '判断节点至少需要「是」和「否」两条出路。',
        targetId: c.id,
        aiFix: `判断节点「${c.label}」(id: ${c.id}) 的分支不完整，请补齐「是/否」两条出路。`,
      })
    }
  }

  return issues
}
