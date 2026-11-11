import { useState } from 'react'
import { ELEMENT_META, elementName, findElement, findParent, insertInTree, isContainer, newElement } from '../model/elements'
import type { DeviceKind, ElementType, WElement } from '../model/types'
import { DEFAULT_STATE } from '../model/types'
import { DND_TYPE } from '../page/PageEditor'
import { useProject, useStore } from '../store'
import { Thumb } from '../render/Thumb'

function PagesTree() {
  const project = useProject()
  const view = useStore((s) => s.view)
  const screenId = useStore((s) => s.screenId)
  const stateId = useStore((s) => s.stateId)
  const sel = useStore((s) => s.sel)
  const openScreen = useStore((s) => s.openScreen)
  const select = useStore((s) => s.select)
  const patch = useStore((s) => s.patch)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const pages = project.screens.filter((s) => s.kind === 'page')
  const overlays = project.screens.filter((s) => s.kind === 'overlay')

  const addPage = (overlay: boolean) => {
    const name = prompt(overlay ? '浮层名称' : '页面名称', overlay ? '新弹窗' : '新页面')
    if (!name) return
    patch([{ op: 'addScreen', screen: { id: '', name, kind: overlay ? 'overlay' : 'page', overlayType: 'modal' } }])
  }

  const row = (s: (typeof project.screens)[number]) => {
    const isOpen = open[s.id] ?? s.states.length > 1
    const active = (view === 'page' && screenId === s.id) || (view === 'flow' && sel.nodeId === s.id)
    return (
      <div key={s.id} className="tree-group">
        <div className={`tree-row ${active ? 'on' : ''}`} onClick={() => (view === 'flow' ? select({ nodeId: s.id }) : openScreen(s.id))} onDoubleClick={() => openScreen(s.id)}>
          <button className="caret" onClick={(e) => (e.stopPropagation(), setOpen((o) => ({ ...o, [s.id]: !isOpen })))}>
            {s.states.length > 1 ? (isOpen ? '▾' : '▸') : ''}
          </button>
          <span className={`ico ${s.kind}`}>{s.kind === 'overlay' ? '◱' : '▯'}</span>
          <span className="tname">{s.name}</span>
          {s.id === project.entryId && <span className="mini-tag">入口</span>}
          {s.states.length > 1 && <span className="count">{s.states.length}</span>}
        </div>
        {isOpen &&
          s.states.length > 1 &&
          s.states.map((st) => (
            <div key={st.id} className={`tree-row sub ${view === 'page' && screenId === s.id && stateId === st.id ? 'on' : ''}`} onClick={() => openScreen(s.id, st.id)}>
              <span className={`dot ${/失败|错误|error|fail/i.test(st.name + st.id) ? 'err' : ''}`} />
              <span className="tname">{st.name}</span>
            </div>
          ))}
      </div>
    )
  }

  return (
    <div className="side-section grow">
      <div className="side-head">
        <span>页面与状态</span>
        <button className="icon-btn" title="新增页面" onClick={() => addPage(false)}>＋</button>
      </div>
      <div className="tree">
        {pages.map(row)}
        {pages.length === 0 && <div className="side-empty">还没有页面。用顶部「AI 生成」或点 ＋ 新建。</div>}
      </div>
      <div className="side-head">
        <span>浮层</span>
        <button className="icon-btn" title="新增浮层" onClick={() => addPage(true)}>＋</button>
      </div>
      <div className="tree">
        {overlays.map(row)}
        {overlays.length === 0 && <div className="side-empty">弹窗、抽屉等</div>}
      </div>
      {project.conditions.length > 0 && (
        <>
          <div className="side-head">
            <span>判断</span>
          </div>
          <div className="tree">
            {project.conditions.map((c) => (
              <div key={c.id} className={`tree-row ${sel.nodeId === c.id ? 'on' : ''}`} onClick={() => select({ nodeId: c.id })}>
                <span className="caret" />
                <span className="ico cond">◇</span>
                <span className="tname">{c.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Layers() {
  const project = useProject()
  const screenId = useStore((s) => s.screenId)
  const stateId = useStore((s) => s.stateId)
  const sel = useStore((s) => s.sel)
  const select = useStore((s) => s.select)
  const screen = project.screens.find((s) => s.id === screenId)
  const state = screen?.states.find((s) => s.id === stateId) ?? screen?.states[0]
  if (!state) return null
  const linked = new Set(project.transitions.filter((t) => t.from === screenId && (t.fromState ?? DEFAULT_STATE) === state.id && t.elementId).map((t) => t.elementId))
  const node = (el: WElement, d: number): React.ReactNode => (
    <div key={el.id}>
      <div className={`tree-row layer ${sel.elementId === el.id ? 'on' : ''}`} style={{ paddingLeft: 8 + d * 12 }} onClick={() => select({ elementId: el.id })}>
        <span className="tname">{d === 0 ? '页面' : elementName(el)}</span>
        {linked.has(el.id) && <span className="mini-tag link">→</span>}
      </div>
      {el.children?.map((c) => node(c, d + 1))}
    </div>
  )
  return (
    <div className="side-section grow">
      <div className="side-head">
        <span>图层 · {screen?.name}</span>
      </div>
      <div className="tree">{node(state.root, 0)}</div>
    </div>
  )
}

const PALETTE_GROUPS: { name: string; types: ElementType[] }[] = [
  { name: '布局', types: ['column', 'row', 'card', 'divider', 'spacer', 'splitter'] },
  { name: '窗口与导航', types: ['titlebar', 'menubar', 'toolbar', 'header', 'nav', 'tabbar', 'tabs', 'breadcrumb', 'tree', 'statusbar'] },
  { name: '内容', types: ['title', 'text', 'image', 'listItem', 'table', 'chart', 'avatar', 'icon', 'badge'] },
  { name: '表单与操作', types: ['button', 'input', 'search', 'select', 'checkbox', 'radio', 'toggle', 'slider'] },
  { name: '反馈与进度', types: ['progress', 'stepper', 'pagination'] },
]

/** Elements that only make sense on some devices. */
const DEVICE_ONLY: Partial<Record<ElementType, DeviceKind[]>> = {
  titlebar: ['desktop'],
  menubar: ['desktop'],
  toolbar: ['desktop', 'web'],
  statusbar: ['desktop'],
  splitter: ['desktop', 'web'],
  tabbar: ['mobile'],
  header: ['mobile', 'desktop'],
  nav: ['web'],
  breadcrumb: ['web', 'desktop'],
  pagination: ['web', 'desktop'],
  tree: ['desktop', 'web'],
}

const findEl = findElement
const insertInto = (root: WElement, parentId: string, el: WElement) => insertInTree(root, parentId, el)
function insertAfter(root: WElement, id: string, el: WElement) {
  const parent = findParent(root, id)
  if (!parent) return insertInTree(root, root.id, el)
  const idx = (parent.children ?? []).findIndex((c) => c.id === id)
  return insertInTree(root, parent.id, el, idx + 1)
}
/** The page's main content column: the largest growing column under the root, else the root. */
function mainColumn(root: WElement): WElement {
  let best: WElement = root
  const visit = (el: WElement, depth: number) => {
    if (depth > 3) return
    for (const c of el.children ?? []) {
      if ((c.type === 'column' || c.type === 'card') && c.props?.grow) best = c
      if (c.type === 'row' || c.type === 'column') visit(c, depth + 1)
    }
  }
  visit(root, 0)
  return best
}

function Palette() {
  const insertNew = (type: ElementType) => {
    const st = useStore.getState()
    const p = st.project()
    const scr = p.screens.find((s) => s.id === st.screenId)
    const state = scr?.states.find((s) => s.id === st.stateId)
    if (!scr || !state) return
    const el = newElement(type)
    const root = state.root
    // insert after the selected element (inside it if it's an empty container); otherwise append to the page
    const selId = st.sel.elementId
    let next: WElement
    const selected = selId ? findEl(root, selId) : undefined
    if (selected && isContainer(selected.type) && (selected === root || !selected.children?.length)) next = insertInto(root, selected.id, el)
    else if (selected && selected !== root) next = insertAfter(root, selected.id, el)
    else next = insertInto(root, mainColumn(root).id, el)
    st.update((x) => ({ ...x, screens: x.screens.map((s) => (s.id === scr.id ? { ...s, states: s.states.map((y) => (y.id === state.id ? { ...y, root: next } : y)) } : s)) }))
    st.select({ elementId: el.id })
  }
  const project = useProject()
  const view = useStore((s) => s.view)
  const update = useStore((s) => s.update)
  const sel = useStore((s) => s.sel)
  const screenId = useStore((s) => s.screenId)
  const stateId = useStore((s) => s.stateId)
  const [tab, setTab] = useState<'basic' | 'lib'>('basic')
  const disabled = view !== 'page'

  const saveSelection = () => {
    const scr = project.screens.find((s) => s.id === screenId)
    const st = scr?.states.find((s) => s.id === stateId)
    const find = (el: WElement): WElement | undefined => (el.id === sel.elementId ? el : el.children?.map(find).find(Boolean))
    const el = st && sel.elementId ? find(st.root) : undefined
    if (!el) return alert('先在画布上选中一个元素')
    const name = prompt('组件名称', el.label ?? ELEMENT_META[el.type].name)
    if (!name) return
    update((p) => ({ ...p, library: [...p.library, { id: `c-${Date.now().toString(36)}`, name, template: structuredClone(el) }] }))
    setTab('lib')
  }

  return (
    <div className="side-section palette">
      <div className="side-head">
        <div className="seg">
          <button className={tab === 'basic' ? 'on' : ''} onClick={() => setTab('basic')}>基础元素</button>
          <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>组件库 {project.library.length}</button>
        </div>
      </div>
      {disabled && <div className="side-empty">进入页面编辑后，拖拽到线框中使用</div>}
      {tab === 'basic' ? (
        <div className="pal-groups">
          {PALETTE_GROUPS.map((g) => {
            const types = g.types.filter((t) => !DEVICE_ONLY[t] || DEVICE_ONLY[t]!.includes(project.device))
            if (!types.length) return null
            return (
              <div key={g.name} className="pal-group">
                <div className="pal-gname">{g.name}</div>
                <div className="pal-grid">
                  {types.map((t) => (
                    <div
                      key={t}
                      className={`pal-item ${disabled ? 'dis' : ''}`}
                      draggable={!disabled}
                      onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'new', type: t }))}
                      onClick={() => !disabled && insertNew(t)}
                      title={`${ELEMENT_META[t].hint}\n点击插入到选中元素之后，或拖到画布上`}
                    >
                      {ELEMENT_META[t].name}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="lib-list">
          {project.library.map((c) => (
            <div key={c.id} className={`lib-item ${disabled ? 'dis' : ''}`} draggable={!disabled} onDragStart={(e) => e.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'lib', id: c.id }))} title={c.description}>
              <div className="lib-thumb">
                <Thumb root={c.template} w={240} h={140} width={64} />
              </div>
              <div className="lib-meta">
                <div className="lib-name">{c.name}</div>
                {c.description && <div className="lib-desc">{c.description}</div>}
              </div>
              <button className="icon-btn" title="删除" onClick={() => confirm(`删除组件「${c.name}」？`) && update((p) => ({ ...p, library: p.library.filter((x) => x.id !== c.id) }))}>×</button>
            </div>
          ))}
          <button className="btn ghost sm full" disabled={disabled || !sel.elementId} onClick={saveSelection}>
            把选中元素存为组件
          </button>
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const view = useStore((s) => s.view)
  return (
    <aside className="sidebar">
      {view === 'flow' ? <PagesTree /> : <Layers />}
      {/* element palette only makes sense while editing a page */}
      {view === 'page' && <Palette />}
    </aside>
  )
}
