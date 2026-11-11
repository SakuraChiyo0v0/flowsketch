import { nanoid } from 'nanoid'
import { emptyRoot, normalizeElement } from './elements'
import type { ComponentDef, PatchOp, Project, Screen, ScreenState, Transition, TransitionInput } from './types'
import { DEFAULT_STATE } from './types'

export interface PatchResult {
  project: Project
  errors: string[]
  applied: number
}

const TRIGGERS = ['tap', 'submit', 'swipe', 'longpress', 'auto', 'back', 'condition']
const ACTIONS = ['navigate', 'open', 'close', 'back', 'setState']
const KINDS = ['normal', 'error', 'back']

function slug(s: string) {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return base || nanoid(6)
}

function uniqueId(wanted: string | undefined, taken: Set<string>, fallback: string) {
  let id = wanted && /^[\w-]+$/.test(wanted) ? wanted : slug(fallback)
  if (!taken.has(id)) return id
  let i = 2
  while (taken.has(`${id}-${i}`)) i++
  return `${id}-${i}`
}

function nodeIds(p: Project) {
  return new Set([...p.screens.map((s) => s.id), ...p.conditions.map((c) => c.id)])
}

function makeState(raw: { id?: string; name?: string; root?: unknown }, taken: Set<string>, library: ComponentDef[]): ScreenState {
  const id = uniqueId(raw.id, taken, raw.name ?? 'state')
  taken.add(id)
  return {
    id,
    name: raw.name || (id === DEFAULT_STATE ? '默认' : id),
    root: raw.root ? normalizeElement(raw.root, library) : emptyRoot(),
  }
}

function normalizeTransition(t: TransitionInput, p: Project, errors: string[]): Transition | null {
  const ids = nodeIds(p)
  if (!ids.has(t.from)) {
    errors.push(`连线起点不存在: ${t.from}`)
    return null
  }
  if (!ids.has(t.to)) {
    errors.push(`连线终点不存在: ${t.to}`)
    return null
  }
  const fromScreen = p.screens.find((s) => s.id === t.from)
  const toScreen = p.screens.find((s) => s.id === t.to)
  const fromIsCond = !fromScreen
  let action = ACTIONS.includes(t.action as string) ? t.action! : undefined
  if (!action) action = toScreen?.kind === 'overlay' ? 'open' : fromScreen?.kind === 'overlay' && t.to === t.from ? 'close' : 'navigate'
  const trigger = TRIGGERS.includes(t.trigger as string) ? t.trigger! : fromIsCond ? 'condition' : 'tap'
  const kind = KINDS.includes(t.kind as string) ? t.kind! : 'normal'
  const out: Transition = {
    id: t.id && !p.transitions.some((x) => x.id === t.id) ? t.id : nanoid(8),
    from: t.from,
    to: t.to,
    trigger,
    action,
    kind,
  }
  if (t.label) out.label = String(t.label)
  if (t.branch) out.branch = String(t.branch)
  if (fromScreen && t.fromState && fromScreen.states.some((s) => s.id === t.fromState)) out.fromState = t.fromState
  if (toScreen && t.toState && toScreen.states.some((s) => s.id === t.toState)) out.toState = t.toState
  if (fromScreen && t.elementId) out.elementId = t.elementId
  return out
}

/** Apply operations in order. Invalid ops are skipped and reported; valid ones still apply. */
export function applyPatch(project: Project, ops: PatchOp[]): PatchResult {
  let p: Project = structuredClone(project)
  const errors: string[] = []
  let applied = 0

  for (const op of ops) {
    const before = errors.length
    try {
      p = applyOne(p, op, errors)
    } catch (e) {
      errors.push(`${(op as { op?: string }).op ?? '?'}: ${(e as Error).message}`)
    }
    if (errors.length === before) applied++
  }
  p.updatedAt = Date.now()
  return { project: p, errors, applied }
}

function applyOne(p: Project, op: PatchOp, errors: string[]): Project {
  switch (op.op) {
    case 'renameProject':
      return { ...p, name: op.name }
    case 'setFeatures':
      return {
        ...p,
        features: (op.features ?? []).map((f) => ({ id: nanoid(6), name: String(f.name), description: f.description })),
        roles: op.roles ?? p.roles,
        sampleData: op.sampleData?.trim() || p.sampleData,
      }
    case 'setSampleData':
      return { ...p, sampleData: op.text.trim() || undefined }
    case 'addScreen': {
      const s = op.screen
      if (!s?.name) {
        errors.push('addScreen 缺少 name')
        return p
      }
      const taken = nodeIds(p)
      const id = uniqueId(s.id, taken, s.name)
      const stateIds = new Set<string>()
      const rawStates = s.states?.length ? s.states : [{ id: DEFAULT_STATE, name: '默认' }]
      const states = rawStates.map((st) => makeState(st, stateIds, p.library))
      if (!states.some((st) => st.id === DEFAULT_STATE)) states[0].id = DEFAULT_STATE
      const screen: Screen = {
        id,
        name: s.name,
        kind: s.kind === 'overlay' ? 'overlay' : 'page',
        description: s.description,
        states,
      }
      if (s.externalEntry) screen.externalEntry = true
      if (screen.kind === 'overlay') screen.overlayType = s.overlayType ?? 'modal'
      const next = { ...p, screens: [...p.screens, screen] }
      if (!next.entryId && screen.kind === 'page') next.entryId = id
      return next
    }
    case 'updateScreen': {
      if (!p.screens.some((s) => s.id === op.id)) {
        errors.push(`页面不存在: ${op.id}`)
        return p
      }
      return {
        ...p,
        screens: p.screens.map((s) => {
          if (s.id !== op.id) return s
          const n = { ...s }
          if (op.name) n.name = op.name
          if (op.description !== undefined) n.description = op.description
          if (op.kind) n.kind = op.kind
          if (op.externalEntry !== undefined) n.externalEntry = op.externalEntry || undefined
          if (op.overlayType) n.overlayType = op.overlayType
          if (n.kind === 'overlay' && !n.overlayType) n.overlayType = 'modal'
          return n
        }),
      }
    }
    case 'removeScreen': {
      if (!p.screens.some((s) => s.id === op.id)) {
        errors.push(`页面不存在: ${op.id}`)
        return p
      }
      const positions = { ...p.positions }
      delete positions[op.id]
      return {
        ...p,
        screens: p.screens.filter((s) => s.id !== op.id),
        transitions: p.transitions.filter((t) => t.from !== op.id && t.to !== op.id),
        entryId: p.entryId === op.id ? p.screens.find((s) => s.id !== op.id && s.kind === 'page')?.id : p.entryId,
        positions,
      }
    }
    case 'addState': {
      const scr = p.screens.find((s) => s.id === op.screenId)
      if (!scr) {
        errors.push(`页面不存在: ${op.screenId}`)
        return p
      }
      const taken = new Set(scr.states.map((s) => s.id))
      const st = makeState(op.state ?? {}, taken, p.library)
      return { ...p, screens: p.screens.map((s) => (s.id === scr.id ? { ...s, states: [...s.states, st] } : s)) }
    }
    case 'removeState': {
      if (op.stateId === DEFAULT_STATE) {
        errors.push('不能删除默认状态')
        return p
      }
      return {
        ...p,
        screens: p.screens.map((s) => (s.id === op.screenId ? { ...s, states: s.states.filter((st) => st.id !== op.stateId) } : s)),
        transitions: p.transitions
          .filter((t) => !(t.from === op.screenId && t.fromState === op.stateId))
          .map((t) => (t.to === op.screenId && t.toState === op.stateId ? { ...t, toState: undefined } : t)),
      }
    }
    case 'setLayout': {
      const scr = p.screens.find((s) => s.id === op.screenId)
      if (!scr) {
        errors.push(`页面不存在: ${op.screenId}`)
        return p
      }
      const stateId = op.stateId || DEFAULT_STATE
      const root = normalizeElement(op.root, p.library)
      const has = scr.states.some((st) => st.id === stateId)
      const states = has
        ? scr.states.map((st) => (st.id === stateId ? { ...st, root } : st))
        : [...scr.states, { id: stateId, name: stateId, root }]
      return { ...p, screens: p.screens.map((s) => (s.id === scr.id ? { ...s, states } : s)) }
    }
    case 'addTransition': {
      const t = normalizeTransition(op.transition, p, errors)
      if (!t) return p
      const dup = p.transitions.find(
        // same edge from a *different* element is not a duplicate (three toggles can each "save")
        (x) => x.from === t.from && x.to === t.to && x.fromState === t.fromState && x.toState === t.toState && (x.label ?? '') === (t.label ?? '') && (x.branch ?? '') === (t.branch ?? '') && (x.elementId ?? '') === (t.elementId ?? ''),
      )
      if (dup) return p
      return { ...p, transitions: [...p.transitions, t] }
    }
    case 'updateTransition': {
      const cur = p.transitions.find((t) => t.id === op.id)
      if (!cur) {
        errors.push(`连线不存在: ${op.id}`)
        return p
      }
      const merged = normalizeTransition({ ...cur, ...op.changes, id: undefined }, { ...p, transitions: p.transitions.filter((t) => t.id !== op.id) }, errors)
      if (!merged) return p
      return { ...p, transitions: p.transitions.map((t) => (t.id === op.id ? { ...merged, id: op.id } : t)) }
    }
    case 'removeTransition':
      if (!p.transitions.some((t) => t.id === op.id)) {
        errors.push(`连线不存在: ${op.id}`)
        return p
      }
      return { ...p, transitions: p.transitions.filter((t) => t.id !== op.id) }
    case 'addCondition': {
      const c = op.condition
      if (!c?.label) {
        errors.push('addCondition 缺少 label')
        return p
      }
      const id = uniqueId(c.id, nodeIds(p), c.label)
      return { ...p, conditions: [...p.conditions, { id, label: c.label }] }
    }
    case 'updateCondition':
      if (!p.conditions.some((c) => c.id === op.id)) {
        errors.push(`判断节点不存在: ${op.id}`)
        return p
      }
      return { ...p, conditions: p.conditions.map((c) => (c.id === op.id ? { ...c, label: op.label } : c)) }
    case 'removeCondition': {
      if (!p.conditions.some((c) => c.id === op.id)) {
        errors.push(`判断节点不存在: ${op.id}`)
        return p
      }
      const positions = { ...p.positions }
      delete positions[op.id]
      return {
        ...p,
        conditions: p.conditions.filter((c) => c.id !== op.id),
        transitions: p.transitions.filter((t) => t.from !== op.id && t.to !== op.id),
        positions,
      }
    }
    case 'setEntry':
      if (!p.screens.some((s) => s.id === op.id)) {
        errors.push(`页面不存在: ${op.id}`)
        return p
      }
      return { ...p, entryId: op.id }
    default:
      errors.push(`未知操作: ${(op as { op?: string }).op}`)
      return p
  }
}

/** Human-readable description of one op, used in proposal cards. */
export function describeOp(op: PatchOp, p: Project): string {
  const name = (id: string) => p.screens.find((s) => s.id === id)?.name ?? p.conditions.find((c) => c.id === id)?.label ?? id
  switch (op.op) {
    case 'addScreen':
      return `新增${op.screen?.kind === 'overlay' ? '浮层' : '页面'}「${op.screen?.name}」`
    case 'updateScreen':
      return `修改页面「${name(op.id)}」`
    case 'removeScreen':
      return `删除页面「${name(op.id)}」`
    case 'addState':
      return `「${name(op.screenId)}」新增状态「${op.state?.name}」`
    case 'removeState':
      return `「${name(op.screenId)}」删除状态 ${op.stateId}`
    case 'setLayout':
      return `生成「${name(op.screenId)}」的布局（${op.stateId || DEFAULT_STATE}）`
    case 'addTransition':
      return `连线 ${name(op.transition?.from)} → ${name(op.transition?.to)}${op.transition?.label ? `「${op.transition.label}」` : ''}${op.transition?.branch ? `（${op.transition.branch}）` : ''}`
    case 'updateTransition':
      return `修改连线 ${op.id}`
    case 'removeTransition': {
      const t = p.transitions.find((x) => x.id === op.id)
      return t ? `删除连线 ${name(t.from)} → ${name(t.to)}` : `删除连线 ${op.id}`
    }
    case 'addCondition':
      return `新增判断「${op.condition?.label}」`
    case 'updateCondition':
      return `修改判断「${name(op.id)}」为「${op.label}」`
    case 'removeCondition':
      return `删除判断「${name(op.id)}」`
    case 'setEntry':
      return `设置入口页为「${name(op.id)}」`
    case 'setFeatures':
      return `更新功能清单（${op.features?.length ?? 0} 项）`
    case 'setSampleData':
      return '更新共享示例数据'
    case 'renameProject':
      return `项目改名为「${op.name}」`
  }
}
