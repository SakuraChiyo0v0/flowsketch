import { ELEMENT_META, elementName, findElement, isContainer, moveInTree, removeFromTree, updateInTree, cloneWithNewIds, findParent, insertInTree } from '../model/elements'
import type { Action, PropValue, Screen, Transition, TransitionKind, Trigger, WElement } from '../model/types'
import { DEFAULT_STATE } from '../model/types'
import { iconNames } from '../render/paint'
import { useProject, useStore } from '../store'

const TRIGGERS: [Trigger, string][] = [
  ['tap', '点击'],
  ['submit', '提交'],
  ['swipe', '滑动'],
  ['longpress', '长按'],
  ['auto', '自动'],
  ['back', '系统返回'],
  ['condition', '条件'],
]
const ACTIONS: [Action, string][] = [
  ['navigate', '跳转页面'],
  ['open', '打开浮层'],
  ['close', '关闭浮层'],
  ['back', '返回上一页'],
  ['setState', '切换状态'],
]
const KINDS: [TransitionKind, string][] = [
  ['normal', '主流程'],
  ['back', '返回/取消'],
  ['error', '出错路径'],
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="flabel">{label}</span>
      {children}
    </label>
  )
}

function TransitionEditor({ t, compact }: { t: Transition; compact?: boolean }) {
  const project = useProject()
  const patch = useStore((s) => s.patch)
  const select = useStore((s) => s.select)
  const fromScreen = project.screens.find((s) => s.id === t.from)
  const toScreen = project.screens.find((s) => s.id === t.to)
  const fromCond = project.conditions.find((c) => c.id === t.from)
  const change = (c: Partial<Transition>) => patch([{ op: 'updateTransition', id: t.id, changes: c }])
  const nodes = [...project.screens.map((s) => ({ id: s.id, name: (s.kind === 'overlay' ? '◱ ' : '') + s.name })), ...project.conditions.map((c) => ({ id: c.id, name: '◇ ' + c.label }))]
  return (
    <div className={`tedit ${compact ? 'compact' : ''}`}>
      {!compact && (
        <Field label="起点">
          <select value={t.from} onChange={(e) => change({ from: e.target.value, fromState: undefined, elementId: undefined })}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </Field>
      )}
      {!compact && fromScreen && fromScreen.states.length > 1 && (
        <Field label="起点状态">
          <select value={t.fromState ?? DEFAULT_STATE} onChange={(e) => change({ fromState: e.target.value === DEFAULT_STATE ? undefined : e.target.value })}>
            {fromScreen.states.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
      )}
      {fromCond ? (
        <Field label="分支">
          <input value={t.branch ?? ''} placeholder="是 / 否" onChange={(e) => change({ branch: e.target.value })} />
        </Field>
      ) : (
        <Field label="触发">
          <select value={t.trigger} onChange={(e) => change({ trigger: e.target.value as Trigger })}>
            {TRIGGERS.map(([v, n]) => (
              <option key={v} value={v}>{n}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="动作">
        <select value={t.action} onChange={(e) => change({ action: e.target.value as Action })}>
          {ACTIONS.map(([v, n]) => (
            <option key={v} value={v}>{n}</option>
          ))}
        </select>
      </Field>
      <Field label="目标">
        <select value={t.to} onChange={(e) => change({ to: e.target.value, toState: undefined })}>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </Field>
      {toScreen && toScreen.states.length > 1 && (
        <Field label="目标状态">
          <select value={t.toState ?? DEFAULT_STATE} onChange={(e) => change({ toState: e.target.value === DEFAULT_STATE ? undefined : e.target.value })}>
            {toScreen.states.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="说明文字">
        <input value={t.label ?? ''} placeholder="如：提交订单" onChange={(e) => change({ label: e.target.value })} />
      </Field>
      <Field label="类型">
        <div className="seg small">
          {KINDS.map(([v, n]) => (
            <button key={v} className={`${t.kind === v ? 'on' : ''} k-${v}`} onClick={() => change({ kind: v })}>{n}</button>
          ))}
        </div>
      </Field>
      <button
        className="btn danger sm"
        onClick={() => {
          patch([{ op: 'removeTransition', id: t.id }])
          if (!compact) select({})
        }}
      >
        删除连线
      </button>
    </div>
  )
}

function ScreenProps({ s }: { s: Screen }) {
  const project = useProject()
  const patch = useStore((x) => x.patch)
  const openScreen = useStore((x) => x.openScreen)
  const select = useStore((x) => x.select)
  const outs = project.transitions.filter((t) => t.from === s.id)
  return (
    <div className="insp-body">
      <Field label="名称">
        <input value={s.name} onChange={(e) => patch([{ op: 'updateScreen', id: s.id, name: e.target.value }])} />
      </Field>
      <Field label="说明">
        <textarea rows={2} value={s.description ?? ''} onChange={(e) => patch([{ op: 'updateScreen', id: s.id, description: e.target.value }])} />
      </Field>
      <Field label="类型">
        <div className="seg small">
          <button className={s.kind === 'page' ? 'on' : ''} onClick={() => patch([{ op: 'updateScreen', id: s.id, kind: 'page' }])}>页面</button>
          {(['modal', 'sheet', 'drawer', 'toast'] as const).map((o) => (
            <button key={o} className={s.kind === 'overlay' && s.overlayType === o ? 'on' : ''} onClick={() => patch([{ op: 'updateScreen', id: s.id, kind: 'overlay', overlayType: o }])}>
              {{ modal: '弹窗', sheet: '底抽屉', drawer: '侧抽屉', toast: '提示' }[o]}
            </button>
          ))}
        </div>
      </Field>
      <div className="insp-sub">状态</div>
      {s.states.map((st) => (
        <div key={st.id} className="state-row">
          <input
            value={st.name}
            onChange={(e) =>
              useStore.getState().update((p) => ({ ...p, screens: p.screens.map((x) => (x.id === s.id ? { ...x, states: x.states.map((y) => (y.id === st.id ? { ...y, name: e.target.value } : y)) } : x)) }))
            }
          />
          <button className="icon-btn" title="编辑" onClick={() => openScreen(s.id, st.id)}>✎</button>
          {st.id !== DEFAULT_STATE && <button className="icon-btn" title="删除状态" onClick={() => patch([{ op: 'removeState', screenId: s.id, stateId: st.id }])}>×</button>}
        </div>
      ))}
      <button
        className="btn ghost sm"
        onClick={() => {
          const name = prompt('状态名称（如：空、加载中、出错）', '空')
          if (!name) return
          const def = s.states.find((x) => x.id === DEFAULT_STATE)
          patch([{ op: 'addState', screenId: s.id, state: { id: '', name, root: def ? cloneWithNewIds(def.root) : undefined } }])
        }}
      >
        ＋ 添加状态（复制默认布局）
      </button>
      <div className="insp-sub">出口连线 {outs.length}</div>
      {outs.map((t) => (
        <button key={t.id} className="link-row" onClick={() => select({ edgeId: t.id })}>
          {[t.branch, t.label].filter(Boolean).join(' · ') || t.action} → {project.screens.find((x) => x.id === t.to)?.name ?? project.conditions.find((c) => c.id === t.to)?.label}
        </button>
      ))}
      <select
        className="screen-pick add-link"
        value=""
        onChange={(e) => {
          const to = e.target.value
          if (!to) return
          const target = project.screens.find((x) => x.id === to)
          patch([{ op: 'addTransition', transition: { from: s.id, to, action: target?.kind === 'overlay' ? 'open' : undefined } }])
          const t = useStore.getState().project().transitions.at(-1)
          if (t) select({ edgeId: t.id })
        }}
      >
        <option value="">＋ 连到…（也可以从节点右侧圆点拖线）</option>
        {project.screens
          .filter((x) => x.id !== s.id)
          .map((x) => (
            <option key={x.id} value={x.id}>{x.kind === 'overlay' ? '◱ ' : '▯ '}{x.name}</option>
          ))}
        {project.conditions.map((c) => (
          <option key={c.id} value={c.id}>◇ {c.label}</option>
        ))}
      </select>
      {project.entryId === s.id && <div className="insp-hint">▶ 这是入口页面</div>}
      {project.entryId !== s.id && (
        <label className="check-row" title="菜单栏/托盘、系统通知、外部链接等直接打开的界面，不需要从入口页走到">
          <input type="checkbox" checked={!!s.externalEntry} onChange={(e) => patch([{ op: 'updateScreen', id: s.id, externalEntry: e.target.checked }])} />
          外部入口（菜单栏、通知、链接直接打开）
        </label>
      )}
      <div className="insp-actions">
        <button className="btn sm" onClick={() => openScreen(s.id)}>编辑布局</button>
        {s.id !== project.entryId && s.kind === 'page' && <button className="btn ghost sm" onClick={() => patch([{ op: 'setEntry', id: s.id }])}>设为入口</button>}
        <button
          className="btn danger sm"
          onClick={() => {
            if (!confirm(`删除「${s.name}」和它的所有连线？`)) return
            patch([{ op: 'removeScreen', id: s.id }])
            select({})
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}

const DEFAULT_ON = new Set(['back', 'thumb', 'chevron', 'on'])

const PROP_FIELDS:Partial<Record<WElement['type'], { key: string; label: string; kind: 'text' | 'num' | 'bool' | 'select'; options?: string[] }[]>> = {
  column: [
    { key: 'gap', label: '间距', kind: 'num' },
    { key: 'pad', label: '内边距', kind: 'num' },
    { key: 'grow', label: '占满剩余', kind: 'bool' },
    { key: 'w', label: '固定宽度', kind: 'num' },
    { key: 'align', label: '水平对齐', kind: 'select', options: ['start', 'center', 'end'] },
    { key: 'border', label: '边框', kind: 'bool' },
    { key: 'fill', label: '灰底', kind: 'bool' },
  ],
  row: [
    { key: 'gap', label: '间距', kind: 'num' },
    { key: 'pad', label: '内边距', kind: 'num' },
    { key: 'align', label: '对齐', kind: 'select', options: ['start', 'center', 'end', 'between'] },
    { key: 'grow', label: '占满剩余', kind: 'bool' },
  ],
  card: [
    { key: 'gap', label: '间距', kind: 'num' },
    { key: 'pad', label: '内边距', kind: 'num' },
    { key: 'align', label: '水平对齐', kind: 'select', options: ['start', 'center', 'end'] },
    { key: 'grow', label: '占满剩余', kind: 'bool' },
  ],
  header: [
    { key: 'back', label: '返回箭头', kind: 'bool' },
    { key: 'action', label: '右侧图标', kind: 'select', options: ['', ...iconNames()] },
  ],
  nav: [
    { key: 'items', label: '菜单项', kind: 'text' },
    { key: 'action', label: '右侧按钮', kind: 'text' },
  ],
  title: [{ key: 'size', label: '字号', kind: 'select', options: ['lg', 'md', 'sm'] }],
  text: [{ key: 'lines', label: '占位行数', kind: 'num' }],
  button: [
    { key: 'variant', label: '样式', kind: 'select', options: ['primary', 'secondary', 'text', 'danger'] },
    { key: 'size', label: '尺寸', kind: 'select', options: ['md', 'sm', 'lg'] },
    { key: 'icon', label: '图标', kind: 'select', options: ['', ...iconNames()] },
    { key: 'grow', label: '撑满', kind: 'bool' },
  ],
  image: [
    { key: 'h', label: '高度', kind: 'num' },
    { key: 'w', label: '宽度(行内)', kind: 'num' },
  ],
  listItem: [
    { key: 'sub', label: '副标题', kind: 'text' },
    { key: 'trailing', label: '右侧文字', kind: 'text' },
    { key: 'thumb', label: '缩略图', kind: 'bool' },
    { key: 'chevron', label: '箭头', kind: 'bool' },
  ],
  tabbar: [
    { key: 'items', label: '标签', kind: 'text' },
    { key: 'active', label: '选中', kind: 'num' },
  ],
  tabs: [
    { key: 'items', label: '标签', kind: 'text' },
    { key: 'active', label: '选中', kind: 'num' },
  ],
  icon: [{ key: 'size', label: '尺寸', kind: 'num' }],
  avatar: [{ key: 'size', label: '尺寸', kind: 'num' }],
  toggle: [{ key: 'on', label: '开启', kind: 'bool' }],
  checkbox: [{ key: 'checked', label: '选中', kind: 'bool' }],
  table: [
    { key: 'cols', label: '列名', kind: 'text' },
    { key: 'rows', label: '行数', kind: 'num' },
  ],
  radio: [
    { key: 'items', label: '选项', kind: 'text' },
    { key: 'active', label: '选中', kind: 'num' },
    { key: 'dir', label: '排列', kind: 'select', options: ['row', 'column'] },
  ],
  slider: [{ key: 'value', label: '数值', kind: 'num' }],
  progress: [{ key: 'value', label: '进度', kind: 'num' }],
  stepper: [
    { key: 'items', label: '步骤', kind: 'text' },
    { key: 'active', label: '当前', kind: 'num' },
  ],
  pagination: [
    { key: 'pages', label: '页数', kind: 'num' },
    { key: 'active', label: '当前', kind: 'num' },
  ],
  breadcrumb: [{ key: 'items', label: '路径', kind: 'text' }],
  titlebar: [{ key: 'os', label: '系统', kind: 'select', options: ['win', 'mac'] }],
  menubar: [{ key: 'items', label: '菜单', kind: 'text' }],
  toolbar: [
    { key: 'items', label: '图标(逗号, | 分隔)', kind: 'text' },
    { key: 'labels', label: '显示文字', kind: 'bool' },
  ],
  tree: [
    { key: 'items', label: '节点(> 表示层级)', kind: 'text' },
    { key: 'active', label: '选中', kind: 'num' },
    { key: 'h', label: '固定高度', kind: 'num' },
  ],
  statusbar: [{ key: 'items', label: '内容', kind: 'text' }],
  select: [{ key: 'w', label: '宽度(行内)', kind: 'num' }],
  chart: [
    { key: 'kind', label: '类型', kind: 'select', options: ['bar', 'line', 'pie'] },
    { key: 'h', label: '高度', kind: 'num' },
  ],
}

function ElementProps({ el, screen, stateId }: { el: WElement; screen: Screen; stateId: string }) {
  const project = useProject()
  const update = useStore((s) => s.update)
  const patch = useStore((s) => s.patch)
  const select = useStore((s) => s.select)
  const state = screen.states.find((s) => s.id === stateId)!
  const isRoot = state.root.id === el.id
  const links = project.transitions.filter((t) => t.from === screen.id && t.elementId === el.id)

  const setRoot = (fn: (r: WElement) => WElement) =>
    update((p) => ({
      ...p,
      screens: p.screens.map((s) => (s.id === screen.id ? { ...s, states: s.states.map((st) => (st.id === stateId ? { ...st, root: fn(st.root) } : st)) } : s)),
    }))
  const setEl = (fn: (e: WElement) => WElement) => setRoot((r) => updateInTree(r, el.id, fn))
  const setProp = (k: string, v: PropValue | undefined) =>
    setEl((e) => {
      const props = { ...(e.props ?? {}) }
      if (v === undefined || v === '') delete props[k]
      else props[k] = v
      return { ...e, props }
    })

  const addLink = () => {
    const fromState = stateId === DEFAULT_STATE ? undefined : stateId
    const label = el.label && !['icon'].includes(el.type) ? el.label : ''
    // sensible default target by element kind
    const inPlace = ['toggle', 'checkbox', 'radio', 'select', 'slider', 'tabs'].includes(el.type)
    const closeLike = screen.kind === 'overlay' && /关闭|取消|完成|确定|知道了/.test(el.label ?? '')
    const backLike = el.type === 'header' || /返回|取消/.test(el.label ?? '')
    const other = screen.states.find((s) => s.id !== stateId)
    const target = project.screens.find((s) => s.id !== screen.id) ?? screen
    const transition = closeLike
      ? { from: screen.id, fromState, elementId: el.id, to: screen.id, label, action: 'close' as const, kind: 'back' as const }
      : inPlace && other
        ? { from: screen.id, fromState, elementId: el.id, to: screen.id, toState: other.id, label, action: 'setState' as const }
        : backLike
          ? { from: screen.id, fromState, elementId: el.id, to: target.id, label, action: 'back' as const, kind: 'back' as const }
          : { from: screen.id, fromState, elementId: el.id, to: target.id, label, action: target.kind === 'overlay' ? ('open' as const) : ('navigate' as const) }
    patch([{ op: 'addTransition', transition }])
  }

  return (
    <div className="insp-body">
      <div className="insp-kind">{isRoot ? '页面根容器' : ELEMENT_META[el.type].name}</div>
      {!isRoot && !['divider', 'spacer', 'column', 'row', 'splitter', 'radio', 'stepper', 'pagination', 'breadcrumb', 'menubar', 'toolbar', 'tree', 'statusbar', 'tabbar', 'tabs', 'table', 'chart'].includes(el.type) && (
        <Field label={el.type === 'icon' ? '图标' : '文字'}>
          {el.type === 'icon' ? (
            <select value={el.label ?? ''} onChange={(e) => setEl((x) => ({ ...x, label: e.target.value }))}>
              {iconNames().map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          ) : (
            <input value={el.label ?? ''} onChange={(e) => setEl((x) => ({ ...x, label: e.target.value || undefined }))} />
          )}
        </Field>
      )}
      {(PROP_FIELDS[el.type] ?? []).map((f) => {
        const v = el.props?.[f.key]
        return (
          <Field key={f.key} label={f.label}>
            {f.kind === 'bool' ? (
              <input
                type="checkbox"
                // these props default to "on" in the painter when unset
                checked={v === undefined ? DEFAULT_ON.has(f.key) : v === true || v === 'true'}
                onChange={(e) => setProp(f.key, e.target.checked)}
              />
            ) : f.kind === 'select' ? (
              <select value={String(v ?? '')} onChange={(e) => setProp(f.key, e.target.value)}>
                {f.options!.map((o) => (
                  <option key={o} value={o}>{o || '（无）'}</option>
                ))}
              </select>
            ) : (
              <input type={f.kind === 'num' ? 'number' : 'text'} value={v === undefined ? '' : String(v)} onChange={(e) => setProp(f.key, f.kind === 'num' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)} />
            )}
          </Field>
        )
      })}

      {!isRoot && (
        <>
          <div className="insp-sub">交互 {links.length > 0 && <span className="count">{links.length}</span>}</div>
          {links.map((t) => (
            <TransitionEditor key={t.id} t={t} compact />
          ))}
          <button className="btn sm" onClick={addLink}>＋ 添加交互</button>
        </>
      )}

      <div className="insp-sub">结构</div>
      <div className="insp-actions">
        {!isRoot && (
          <>
            <button className="btn ghost sm" title="上移" onClick={() => setRoot((r) => moveInTree(r, el.id, -1))}>↑</button>
            <button className="btn ghost sm" title="下移" onClick={() => setRoot((r) => moveInTree(r, el.id, 1))}>↓</button>
            <button
              className="btn ghost sm"
              onClick={() => {
                const parent = findParent(state.root, el.id)
                if (!parent) return
                const idx = (parent.children ?? []).findIndex((c) => c.id === el.id)
                const copy = cloneWithNewIds(el)
                setRoot((r) => insertInTree(r, parent.id, copy, idx + 1))
                select({ elementId: copy.id })
              }}
            >
              复制
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                const parent = findParent(state.root, el.id)
                if (parent) select({ elementId: parent.id })
              }}
            >
              选父级
            </button>
          </>
        )}
        {isContainer(el.type) && !isRoot && (
          <button
            className="btn ghost sm"
            onClick={() => setEl((x) => ({ ...x, type: x.type === 'row' ? 'column' : x.type === 'column' ? 'row' : x.type }))}
          >
            {el.type === 'row' ? '改为纵向' : el.type === 'column' ? '改为横向' : ''}
          </button>
        )}
        {!isRoot && (
          <button
            className="btn danger sm"
            onClick={() => {
              const parent = findParent(state.root, el.id)
              setRoot((r) => removeFromTree(r, el.id))
              select(parent ? { elementId: parent.id } : {})
            }}
          >
            删除
          </button>
        )}
      </div>
      <div className="insp-hint">从左侧拖入元素：放到容器上会追加到末尾，放到元素上会插在它后面。</div>
    </div>
  )
}

export function Inspector() {
  const project = useProject()
  const view = useStore((s) => s.view)
  const sel = useStore((s) => s.sel)
  const screenId = useStore((s) => s.screenId)
  const stateId = useStore((s) => s.stateId)
  const patch = useStore((s) => s.patch)
  const select = useStore((s) => s.select)

  let title = '属性'
  let body: React.ReactNode = <div className="insp-empty">选中一个页面、判断或连线查看属性。拖动节点右侧的圆点到另一个节点即可连线。</div>

  if (view === 'page') {
    const screen = project.screens.find((s) => s.id === screenId)
    const state = screen?.states.find((s) => s.id === stateId) ?? screen?.states[0]
    const el = state && sel.elementId ? findElement(state.root, sel.elementId) : undefined
    if (screen && state && el) {
      title = el.id === state.root.id ? `${screen.name} · ${state.name}` : elementName(el)
      body = <ElementProps el={el} screen={screen} stateId={state.id} />
    } else if (screen) {
      title = screen.name
      body = <ScreenProps s={screen} />
    }
  } else if (sel.edgeId) {
    const t = project.transitions.find((x) => x.id === sel.edgeId)
    if (t) {
      title = '连线'
      body = (
        <div className="insp-body">
          <TransitionEditor t={t} />
        </div>
      )
    }
  } else if (sel.nodeId) {
    const s = project.screens.find((x) => x.id === sel.nodeId)
    const c = project.conditions.find((x) => x.id === sel.nodeId)
    if (s) {
      title = s.name
      body = <ScreenProps s={s} />
    } else if (c) {
      title = '判断'
      const outs = project.transitions.filter((t) => t.from === c.id)
      body = (
        <div className="insp-body">
          <Field label="判断条件">
            <input value={c.label} onChange={(e) => patch([{ op: 'updateCondition', id: c.id, label: e.target.value }])} />
          </Field>
          <div className="insp-sub">分支 {outs.length}</div>
          {outs.map((t) => (
            <button key={t.id} className="link-row" onClick={() => select({ edgeId: t.id })}>
              {t.branch || '（未命名）'} → {project.screens.find((x) => x.id === t.to)?.name ?? t.to}
            </button>
          ))}
          <div className="insp-hint">从菱形右侧圆点拖到目标节点添加分支，第一条默认「是」，第二条默认「否」。</div>
          <button
            className="btn danger sm"
            onClick={() => {
              patch([{ op: 'removeCondition', id: c.id }])
              select({})
            }}
          >
            删除判断
          </button>
        </div>
      )
    }
  }

  return (
    <div className="inspector">
      <div className="panel-head">{title}</div>
      {body}
    </div>
  )
}
