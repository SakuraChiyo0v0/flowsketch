import { nanoid } from 'nanoid'
import type { ComponentDef, DeviceKind, ElementType, PropValue, WElement } from './types'

export interface ElementMeta {
  type: ElementType
  name: string
  container: boolean
  /** default props when inserted from the palette */
  defaults: { label?: string; props?: Record<string, PropValue>; children?: WElement[] }
  hint: string
}

export const ELEMENT_META: Record<ElementType, ElementMeta> = {
  column: { type: 'column', name: '纵向容器', container: true, defaults: { props: { gap: 8, pad: 0 } }, hint: '子元素纵向排列；props: gap, pad, grow, align(center|end，让图标/头像/短文字居中)' },
  row: { type: 'row', name: '横向容器', container: true, defaults: { props: { gap: 8, pad: 0 } }, hint: '子元素横向排列；props: gap, pad, grow, align(start|center|end|between)' },
  card: { type: 'card', name: '卡片', container: true, defaults: { props: { pad: 12, gap: 6 } }, hint: '带边框的容器，子元素纵向排列；props: pad, gap, align' },
  header: { type: 'header', name: '顶部栏', container: false, defaults: { label: '标题', props: { back: true } }, hint: 'label=标题；props: back(bool), action(右侧图标名)' },
  nav: { type: 'nav', name: '导航栏(Web)', container: false, defaults: { label: 'Logo', props: { items: '首页,产品,关于' } }, hint: 'Web 顶部导航；label=品牌名；props.items 逗号分隔' },
  title: { type: 'title', name: '标题文字', container: false, defaults: { label: '标题' }, hint: 'label=文字；props.size: lg|md|sm' },
  text: { type: 'text', name: '文本', container: false, defaults: { props: { lines: 2 } }, hint: 'label 可选；不给 label 时画 lines 行占位线' },
  button: { type: 'button', name: '按钮', container: false, defaults: { label: '按钮', props: { variant: 'primary' } }, hint: 'label=文字；props.variant: primary|secondary|text|danger；props.size: sm|md|lg（lg=大号醒目按钮）；props.icon=图标名' },
  input: { type: 'input', name: '输入框', container: false, defaults: { label: '请输入' }, hint: 'label=占位文字' },
  search: { type: 'search', name: '搜索框', container: false, defaults: { label: '搜索' }, hint: 'label=占位文字' },
  image: { type: 'image', name: '图片占位', container: false, defaults: { props: { h: 140 } }, hint: 'props.h 高度' },
  listItem: { type: 'listItem', name: '列表项', container: false, defaults: { label: '列表项', props: { thumb: true, chevron: true } }, hint: 'label=主文字；props: thumb(bool), sub(副文字), chevron(bool), trailing(右侧文字)' },
  tabbar: { type: 'tabbar', name: '底部标签栏', container: false, defaults: { props: { items: '首页,发现,我的', active: 0 } }, hint: 'props.items 逗号分隔，props.active 选中下标' },
  tabs: { type: 'tabs', name: '分段标签', container: false, defaults: { props: { items: '全部,进行中,已完成', active: 0 } }, hint: 'props.items, props.active' },
  icon: { type: 'icon', name: '图标', container: false, defaults: { label: 'star' }, hint: 'label=图标名(home,search,user,cart,star,heart,bell,settings,plus,close,back,menu,check,more,chat,mail)' },
  avatar: { type: 'avatar', name: '头像', container: false, defaults: { props: { size: 40 } }, hint: 'props.size' },
  badge: { type: 'badge', name: '标签/徽标', container: false, defaults: { label: '标签' }, hint: 'label=文字' },
  toggle: { type: 'toggle', name: '开关', container: false, defaults: { label: '开关项', props: { on: true } }, hint: 'label=说明；props.on' },
  checkbox: { type: 'checkbox', name: '复选框', container: false, defaults: { label: '选项', props: { checked: false } }, hint: 'label=说明；props.checked' },
  divider: { type: 'divider', name: '分割线', container: false, defaults: {}, hint: '水平分割线' },
  spacer: { type: 'spacer', name: '弹性空白', container: false, defaults: {}, hint: '占满剩余空间，用于把元素推到底部' },
  table: { type: 'table', name: '表格', container: false, defaults: { props: { cols: '名称,状态,时间', rows: 4 } }, hint: 'props.cols 逗号分隔列名，props.rows 行数' },
  chart: { type: 'chart', name: '图表', container: false, defaults: { props: { kind: 'bar', h: 160 } }, hint: 'props.kind: bar|line|pie，props.h' },
  select: { type: 'select', name: '下拉选择', container: false, defaults: { label: '请选择' }, hint: 'label=当前值或占位文字' },
  radio: { type: 'radio', name: '单选组', container: false, defaults: { props: { items: '选项一,选项二', active: 0 } }, hint: 'props.items 逗号分隔，props.active 选中下标，props.dir: row|column' },
  slider: { type: 'slider', name: '滑块', container: false, defaults: { label: '音量', props: { value: 60 } }, hint: 'label=说明；props.value 0-100' },
  progress: { type: 'progress', name: '进度条', container: false, defaults: { props: { value: 40 } }, hint: 'props.value 0-100；label 可选说明' },
  stepper: { type: 'stepper', name: '步骤条', container: false, defaults: { props: { items: '填写信息,确认,完成', active: 0 } }, hint: '多步流程指示；props.items, props.active' },
  pagination: { type: 'pagination', name: '分页', container: false, defaults: { props: { pages: 5, active: 0 } }, hint: 'props.pages 页数，props.active' },
  breadcrumb: { type: 'breadcrumb', name: '面包屑', container: false, defaults: { props: { items: '首页,列表,详情' } }, hint: 'props.items 逗号分隔' },
  titlebar: { type: 'titlebar', name: '窗口标题栏', container: false, defaults: { label: '应用名称' }, hint: '桌面应用窗口最顶部：label=窗口标题；props.os: win|mac' },
  menubar: { type: 'menubar', name: '菜单栏', container: false, defaults: { props: { items: '文件,编辑,视图,帮助' } }, hint: '桌面应用菜单栏；props.items 逗号分隔' },
  toolbar: { type: 'toolbar', name: '工具栏', container: false, defaults: { props: { items: 'plus,edit,trash,|,search,settings' } }, hint: '桌面应用图标工具栏；props.items 为图标名逗号分隔，| 表示分隔线；props.labels=true 显示文字' },
  tree: { type: 'tree', name: '树形目录', container: false, defaults: { props: { items: '文档,>项目 A,>>需求.md,>项目 B,图片', active: 1 } }, hint: '文件夹/目录树；props.items 逗号分隔，前缀 > 表示层级；props.active 选中下标；常放在侧边栏，配合 grow 占满高度' },
  statusbar: { type: 'statusbar', name: '状态栏', container: false, defaults: { props: { items: '就绪,第 1 行,UTF-8' } }, hint: '桌面应用窗口最底部；props.items 逗号分隔' },
  splitter: { type: 'splitter', name: '分栏线', container: false, defaults: {}, hint: '放在 row 里两栏之间的竖向可拖动分隔线' },
}

export const ELEMENT_TYPES = Object.keys(ELEMENT_META) as ElementType[]

export function isContainer(t: ElementType) {
  return ELEMENT_META[t].container
}

export function newElement(type: ElementType): WElement {
  const d = ELEMENT_META[type].defaults
  const el: WElement = { id: nanoid(8), type }
  if (d.label) el.label = d.label
  if (d.props) el.props = { ...d.props }
  if (isContainer(type)) el.children = d.children ? d.children.map(cloneWithNewIds) : []
  return el
}

export function cloneWithNewIds(el: WElement): WElement {
  return {
    ...el,
    id: nanoid(8),
    props: el.props ? { ...el.props } : undefined,
    children: el.children?.map(cloneWithNewIds),
  }
}

/**
 * Turn untrusted (AI-produced) JSON into a valid element tree. Unknown types fall back to text.
 * `{ "type": "use", "component": "<id or name>" }` expands a library component.
 */
export function normalizeElement(raw: unknown, library: ComponentDef[] = [], seen = new Set<string>(), depth = 0): WElement {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (o.type === 'use' || o.type === 'component') {
    const key = String(o.component ?? o.name ?? o.ref ?? '')
    const def = library.find((c) => c.id === key || c.name === key)
    if (def) {
      const el = cloneWithNewIds(def.template)
      if (typeof o.id === 'string' && o.id && !seen.has(o.id)) el.id = o.id
      // fill the component's placeholder texts in order: `labels` array, or `label` for the first one
      const labels: string[] = Array.isArray(o.labels) ? o.labels.map(String) : o.label != null && o.label !== '' ? [String(o.label)] : []
      if (labels.length) {
        const slots: WElement[] = []
        walk(el, (n) => {
          if (n !== el && n.label != null && !isContainer(n.type)) slots.push(n)
        })
        if (!slots.length) el.label = labels[0]
        labels.forEach((l, i) => slots[i] && (slots[i].label = l))
      }
      walk(el, (n) => seen.add(n.id))
      return el
    }
  }
  let type = String(o.type ?? 'column') as ElementType
  const aliases: Record<string, ElementType> = {
    container: 'column', stack: 'column', vstack: 'column', hstack: 'row', box: 'column', section: 'column',
    list: 'column', label: 'text', paragraph: 'text', heading: 'title', h1: 'title', img: 'image',
    textfield: 'input', textarea: 'input', switch: 'toggle', topbar: 'header', appbar: 'header',
    navbar: 'nav', bottomnav: 'tabbar', tabbar: 'tabbar', separator: 'divider', link: 'button',
    dropdown: 'select', combobox: 'select', picker: 'select', radiogroup: 'radio', range: 'slider',
    progressbar: 'progress', steps: 'stepper', pager: 'pagination', crumbs: 'breadcrumb',
    windowtitle: 'titlebar', titlebar: 'titlebar', menu: 'menubar', menubar: 'menubar', toolbar: 'toolbar',
    treeview: 'tree', filetree: 'tree', outline: 'tree', status: 'statusbar', footer: 'statusbar', resizer: 'splitter',
    grid: 'table', datagrid: 'table',
  }
  if (!(type in ELEMENT_META)) type = aliases[type.toLowerCase()] ?? 'text'
  let id = typeof o.id === 'string' && o.id ? o.id : nanoid(8)
  if (seen.has(id)) id = nanoid(8)
  seen.add(id)
  const el: WElement = { id, type }
  if (o.label != null && o.label !== '') el.label = String(o.label)
  if (o.props && typeof o.props === 'object') {
    const props: Record<string, PropValue> = {}
    for (const [k, v] of Object.entries(o.props as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') props[k] = v
      else if (Array.isArray(v)) props[k] = v.map(String).join(',')
    }
    if (Object.keys(props).length) el.props = props
  }
  if (isContainer(type)) {
    const kids = Array.isArray(o.children) && depth < 12 ? o.children : []
    el.children = kids.map((c) => normalizeElement(c, library, seen, depth + 1))
  }
  return el
}

export function emptyRoot(): WElement {
  return { id: nanoid(8), type: 'column', props: { gap: 0 }, children: [] }
}

/** Starter skeleton for a manually created screen so it isn't a blank box. */
export function starterRoot(device: DeviceKind, kind: 'page' | 'overlay', name: string, appName: string): WElement {
  const n = (raw: unknown) => normalizeElement(raw)
  if (kind === 'overlay')
    return n({
      type: 'column',
      props: { pad: 20, gap: 12 },
      children: [{ type: 'title', label: name }, { type: 'text', props: { lines: 2 } }, { type: 'row', props: { align: 'end', gap: 8 }, children: [{ type: 'button', label: '取消', props: { variant: 'secondary' } }, { type: 'button', label: '确定' }] }],
    })
  const content = { type: 'column', props: { pad: 16, gap: 12, grow: true }, children: [{ type: 'title', label: name }, { type: 'text', props: { lines: 3 } }] }
  if (device === 'desktop')
    return n({
      type: 'column',
      children: [
        { type: 'titlebar', label: `${appName} - ${name}` },
        { type: 'menubar' },
        { type: 'row', props: { grow: true, gap: 0 }, children: [{ type: 'column', props: { w: 220, pad: 8 }, children: [{ type: 'tree' }] }, { type: 'splitter' }, content] },
        { type: 'statusbar', props: { items: '就绪' } },
      ],
    })
  if (device === 'web')
    return n({
      type: 'column',
      children: [
        { type: 'nav', label: appName },
        { type: 'row', props: { grow: true, gap: 0 }, children: [{ type: 'column', props: { w: 220, pad: 12, gap: 4 }, children: [{ type: 'listItem', label: '菜单一' }, { type: 'listItem', label: '菜单二' }] }, { type: 'divider' }, content] },
      ],
    })
  return n({ type: 'column', children: [{ type: 'header', label: name }, content] })
}

// ---- tree helpers ----------------------------------------------------------

export function findElement(root: WElement, id: string): WElement | undefined {
  if (root.id === id) return root
  for (const c of root.children ?? []) {
    const f = findElement(c, id)
    if (f) return f
  }
}

export function findParent(root: WElement, id: string): WElement | undefined {
  for (const c of root.children ?? []) {
    if (c.id === id) return root
    const f = findParent(c, id)
    if (f) return f
  }
}

export function walk(root: WElement, fn: (el: WElement) => void) {
  fn(root)
  for (const c of root.children ?? []) walk(c, fn)
}

export function mapTree(root: WElement, fn: (el: WElement) => WElement): WElement {
  const next = fn(root)
  if (!next.children) return next
  return { ...next, children: next.children.map((c) => mapTree(c, fn)) }
}

export function removeFromTree(root: WElement, id: string): WElement {
  if (!root.children) return root
  return {
    ...root,
    children: root.children.filter((c) => c.id !== id).map((c) => removeFromTree(c, id)),
  }
}

export function updateInTree(root: WElement, id: string, fn: (el: WElement) => WElement): WElement {
  return mapTree(root, (el) => (el.id === id ? fn(el) : el))
}

/** Insert `el` into container `parentId` at index (append if undefined). */
export function insertInTree(root: WElement, parentId: string, el: WElement, index?: number): WElement {
  return mapTree(root, (n) => {
    if (n.id !== parentId || !n.children) return n
    const kids = [...n.children]
    kids.splice(index ?? kids.length, 0, el)
    return { ...n, children: kids }
  })
}

export function moveInTree(root: WElement, id: string, delta: -1 | 1): WElement {
  return mapTree(root, (n) => {
    if (!n.children) return n
    const i = n.children.findIndex((c) => c.id === id)
    if (i < 0) return n
    const j = i + delta
    if (j < 0 || j >= n.children.length) return n
    const kids = [...n.children]
    ;[kids[i], kids[j]] = [kids[j], kids[i]]
    return { ...n, children: kids }
  })
}

export function isDescendant(root: WElement, ancestorId: string, id: string): boolean {
  const a = findElement(root, ancestorId)
  return !!a && !!findElement(a, id) && ancestorId !== id
}

export function interactiveElements(root: WElement): WElement[] {
  const out: WElement[] = []
  walk(root, (el) => {
    if (['button', 'listItem', 'icon', 'card', 'input', 'search', 'tabbar', 'tabs', 'avatar', 'image', 'header', 'nav', 'toggle', 'checkbox', 'select', 'radio', 'menubar', 'toolbar', 'tree', 'pagination', 'breadcrumb', 'table'].includes(el.type)) out.push(el)
  })
  return out
}

export function elementName(el: WElement) {
  return el.label ? `${ELEMENT_META[el.type].name}「${el.label}」` : ELEMENT_META[el.type].name
}
