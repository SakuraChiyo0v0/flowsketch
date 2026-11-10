import { useEffect, useMemo, useRef, useState } from 'react'
import { cloneWithNewIds, findElement, isContainer, newElement, insertInTree, findParent, isDescendant, removeFromTree } from '../model/elements'
import type { ElementType, Transition, WElement } from '../model/types'
import { DEFAULT_STATE, DEVICE_SIZE } from '../model/types'
import { paintTree } from '../render/paint'
import { frameSize, OVERLAY_LABEL } from '../render/frame'
import { useProject, useStore } from '../store'
import { runStep } from '../ai/runSteps'

const DND_TYPE = 'application/x-flowsketch'

export function PageEditor() {
  const project = useProject()
  const screenId = useStore((s) => s.screenId)
  const stateId = useStore((s) => s.stateId)
  const sel = useStore((s) => s.sel)
  const select = useStore((s) => s.select)
  const update = useStore((s) => s.update)
  const openScreen = useStore((s) => s.openScreen)
  const busy = useStore((s) => s.busy)
  const showToast = useStore((s) => s.showToast)
  const [zoom, setZoom] = useState(1)
  const stageRef = useRef<HTMLDivElement>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const screen = project.screens.find((s) => s.id === screenId)
  const state = screen?.states.find((s) => s.id === stateId) ?? screen?.states[0]
  const fs = screen && state ? frameSize(project, screen, state.id) : DEVICE_SIZE[project.device]
  const painted = useMemo(() => (state ? paintTree(state.root, fs.w, fs.h) : null), [state, fs.w, fs.h])

  // fit the device frame into the visible stage whenever the screen or device changes
  const fitKey = `${screenId}|${project.device}`
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const availH = el.clientHeight - 64
    // stage padding 48 + 4 flex gaps of 24 + two io columns
    const availW = el.clientWidth - 2 * 150 - 48 - 4 * 24 - 8
    const dev = DEVICE_SIZE[project.device]
    // mobile: fit height; web: fit width (pages are wide, vertical scroll is fine)
    const z = project.device === 'mobile' ? Math.min(1, availH / Math.min(fs.h, dev.h * 1.15), availW / fs.w) : Math.min(1, availW / fs.w)
    setZoom(Math.max(0.25, Math.floor(z * 20) / 20))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  if (!screen || !state || !painted) return <div className="empty-hint">在左侧选择一个页面</div>

  const outgoing = project.transitions.filter((t) => t.from === screen.id && (t.fromState ?? DEFAULT_STATE) === state.id)
  const incoming = project.transitions.filter((t) => t.to === screen.id)
  const byElement = new Map<string, Transition[]>()
  for (const t of outgoing) if (t.elementId) byElement.set(t.elementId, [...(byElement.get(t.elementId) ?? []), t])
  const nodeName = (id: string) => project.screens.find((s) => s.id === id)?.name ?? project.conditions.find((c) => c.id === id)?.label ?? id

  const sid = screen.id
  const stid = state.id
  const setRoot = (fn: (r: WElement) => WElement) =>
    update((p) => ({
      ...p,
      screens: p.screens.map((s) => (s.id === sid ? { ...s, states: s.states.map((st) => (st.id === stid ? { ...st, root: fn(st.root) } : st)) } : s)),
    }))

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const raw = e.dataTransfer.getData(DND_TYPE)
    if (!raw) return
    const data = JSON.parse(raw) as { kind: 'new'; type: ElementType } | { kind: 'lib'; id: string } | { kind: 'move'; id: string }
    let target = findElement(state.root, targetId)
    if (!target) return
    let index: number | undefined
    if (!isContainer(target.type)) {
      const parent = findParent(state.root, target.id)
      if (!parent) return
      index = (parent.children ?? []).findIndex((c) => c.id === target!.id) + 1
      target = parent
    }
    const parentId = target.id
    if (data.kind === 'move') {
      if (data.id === parentId || isDescendant(state.root, data.id, parentId)) return
      const el = findElement(state.root, data.id)
      if (!el) return
      setRoot((r) => insertInTree(removeFromTree(r, data.id), parentId, el, index))
      select({ elementId: data.id })
      return
    }
    let el
    if (data.kind === 'new') el = newElement(data.type)
    else {
      const def = project.library.find((c) => c.id === data.id)
      if (!def) return
      el = cloneWithNewIds(def.template)
    }
    setRoot((r) => insertInTree(r, parentId, el, index))
    select({ elementId: el.id })
  }

  const scale = zoom
  return (
    <div className="page-editor" onClick={() => select({})}>
      <div className="page-toolbar" onClick={(e) => e.stopPropagation()}>
        <select className="screen-pick" value={screen.id} onChange={(e) => openScreen(e.target.value)}>
          {project.screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind === 'overlay' ? '◱ ' : ''}
              {s.name}
            </option>
          ))}
        </select>
        <div className="state-tabs">
          {screen.states.map((st) => (
            <button key={st.id} className={`tab ${st.id === state.id ? 'on' : ''} ${/失败|错误|error|fail/i.test(st.name + st.id) ? 'err' : ''}`} onClick={() => openScreen(screen.id, st.id)}>
              {st.name}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button
          className="btn ghost sm"
          disabled={!!busy}
          title="用 AI 重新生成这个页面所有状态的布局"
          onClick={async () => {
            if (!confirm(`用 AI 重新生成「${screen.name}」的布局？当前布局会被覆盖（可撤销）。`)) return
            try {
              showToast(await runStep('layouts', { screenIds: [screen.id] }))
            } catch (e) {
              showToast((e as Error).message)
            }
          }}
        >
          ✦ AI 重做布局
        </button>
        <button className="btn ghost sm" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}>−</button>
        <button className="zoom" title="重置为 100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button className="btn ghost sm" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}>＋</button>
      </div>

      <div className="page-stage" ref={stageRef}>
        <div className="io-col">
          <div className="io-title">从这里进入</div>
          {incoming.length === 0 && <div className="io-none">{screen.id === project.entryId ? '入口页' : '无'}</div>}
          {incoming.map((t) => (
            <button key={t.id} className={`io-item ${t.kind}`} onClick={(e) => (e.stopPropagation(), project.screens.some((s) => s.id === t.from) && openScreen(t.from, t.fromState))}>
              <span className="io-node">{nodeName(t.from)}</span>
              <span className="io-label">{[t.branch, t.label].filter(Boolean).join(' · ') || t.action}{t.toState && t.toState !== state.id ? ` →[${screen.states.find((x) => x.id === t.toState)?.name}]` : ''}</span>
            </button>
          ))}
        </div>

        <div className={`device-wrap ${screen.kind === 'overlay' ? `ov-${screen.overlayType}` : ''}`}>
          {screen.kind === 'overlay' && <div className="ov-tag">{OVERLAY_LABEL[screen.overlayType ?? 'modal']}</div>}
          <div className="device" style={{ width: fs.w * scale, height: fs.h * scale }}>
            <svg width={fs.w * scale} height={fs.h * scale} viewBox={`0 0 ${fs.w} ${fs.h}`}>
              <rect width={fs.w} height={fs.h} fill="#fff" />
              <g dangerouslySetInnerHTML={{ __html: painted.svg }} />
            </svg>
            <div className="hit-layer" style={{ transform: `scale(${scale})`, width: fs.w, height: fs.h }}>
              {painted.boxes.map((b) => {
                const linked = byElement.get(b.el.id)
                const selected = sel.elementId === b.el.id
                return (
                  <div
                    key={b.el.id}
                    className={`hit ${selected ? 'sel' : ''} ${linked ? 'linked' : ''} ${dropTarget === b.el.id ? 'drop' : ''} ${b.depth === 0 ? 'root' : ''}`}
                    style={{ left: b.x, top: b.y, width: Math.max(b.w, 4), height: Math.max(b.h, 4), zIndex: b.depth + 1 }}
                    draggable={b.depth > 0}
                    onDragStart={(e) => {
                      e.stopPropagation()
                      e.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'move', id: b.el.id }))
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDropTarget(b.el.id)
                    }}
                    onDragLeave={() => setDropTarget((d) => (d === b.el.id ? null : d))}
                    onDrop={(e) => onDrop(e, b.el.id)}
                    onClick={(e) => {
                      e.stopPropagation()
                      select({ elementId: b.el.id })
                    }}
                    title={b.el.label ?? b.el.type}
                  >
                    {linked && <span className="link-badge">→ {linked.map((t) => nodeName(t.to)).join(' / ')}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="io-col">
          <div className="io-title">从这里离开</div>
          {outgoing.length === 0 && <div className="io-none">无出口</div>}
          {outgoing.map((t) => {
            const el = t.elementId ? findElement(state.root, t.elementId) : undefined
            return (
              <button
                key={t.id}
                className={`io-item ${t.kind} ${el && sel.elementId === el.id ? 'hl' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (el) select({ elementId: el.id })
                  else if (project.screens.some((s) => s.id === t.to)) openScreen(t.to, t.toState)
                }}
                onDoubleClick={(e) => (e.stopPropagation(), project.screens.some((s) => s.id === t.to) && openScreen(t.to, t.toState))}
              >
                <span className="io-label">{[t.branch, t.label].filter(Boolean).join(' · ') || t.action}{el ? '' : t.elementId ? ' (元素已丢失)' : ''}</span>
                <span className="io-node">→ {nodeName(t.to)}{t.toState ? `[${project.screens.find((s) => s.id === t.to)?.states.find((x) => x.id === t.toState)?.name ?? t.toState}]` : ''}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export { DND_TYPE }
