import { ELEMENT_META, ELEMENT_TYPES } from '../model/elements'
import type { PatchOp, Project } from '../model/types'
import { DEFAULT_STATE, DEVICES } from '../model/types'

// Prompt builders. The model always answers with JSON that we turn into PatchOps,
// so every AI change goes through the same validated applyPatch path as user edits.

export const STEPS = [
  { n: 1, key: 'features', name: '功能清单', desc: '从需求拆出用户角色和功能点' },
  { n: 2, key: 'sitemap', name: '页面结构', desc: '列出页面、浮层和每个页面的状态' },
  { n: 3, key: 'flows', name: '交互流程', desc: '页面之间的跳转、判断分支和出错路径' },
  { n: 4, key: 'layouts', name: '页面布局', desc: '用组件为每个页面状态生成线框' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

const BASE = `你是一名资深交互设计师，帮助用户设计软件的交互逻辑和低保真线框图。
只关注：操作逻辑、页面结构与布局、页面间跳转、状态和分支。不关心配色、字体、品牌视觉。
所有界面文字用简体中文，简洁真实（像真实产品里的文案），不要写 "Lorem ipsum"。
你只能输出一个 JSON 对象，不要输出任何解释或 Markdown。`

function elementDoc() {
  return ELEMENT_TYPES.map((t) => `- ${t}（${ELEMENT_META[t].name}${ELEMENT_META[t].container ? '，容器，有 children' : ''}）：${ELEMENT_META[t].hint}`).join('\n')
}

function libraryDoc(p: Project) {
  if (!p.library.length) return '（无）'
  return p.library.map((c) => `- ${c.id}「${c.name}」：${c.description ?? ''}。用法 {"type":"use","component":"${c.id}","label":"可选覆盖文字"}`).join('\n')
}

const LAYOUT_RULES = `布局规则：
- 每个页面状态的根节点是 {"type":"column","children":[...]}，代表整个屏幕，从上到下排列。
- 尺寸和坐标由系统自动计算，不要输出 x/y/width/height。
- 用 row/column/card 组合，用 props.pad 加内边距（常用 12 或 16），props.gap 设间距。
- 想让某块占满剩余高度：props.grow=true；想把底部按钮推到底：在它前面放 {"type":"spacer"}。
- 移动端：顶部通常 header，主导航页面底部 tabbar；子页面 header.props.back=true。
- Web 端：顶部 nav，常见左侧 column（props.w=220）+ 右侧主内容 column（grow）放在一个 row 里。
- 桌面应用：最顶部 titlebar（窗口标题），其下按需 menubar、toolbar；主体是一个 row（props.grow=true）里放侧边栏 column（props.w=220，常含 tree 或 listItem 列表）、splitter、主内容 column（grow）；最底部 statusbar。不要用 tabbar 和手机式 header。
- 设置类、属性类界面多用 row 把「标签文字 + 控件（select/toggle/radio/slider/input）」排成一行。
- 浮层（modal/sheet）的根节点只画浮层内容本身，用 props.pad=20。
- 会触发跳转的元素（按钮、列表项、图标等）必须带一个稳定、语义化的 id，例如 "login-submit"。
可用元素：
`

export function projectSummary(p: Project, opts: { layouts?: boolean } = {}) {
  const lines: string[] = []
  lines.push(`项目：${p.name}（${DEVICES[p.device].name}）`)
  if (p.brief) lines.push(`需求描述：${p.brief}`)
  if (p.roles.length) lines.push(`用户角色：${p.roles.join('、')}`)
  if (p.features.length) lines.push(`功能：\n${p.features.map((f) => `- ${f.name}${f.description ? `：${f.description}` : ''}`).join('\n')}`)
  if (p.screens.length) {
    lines.push('页面（id｜名称｜类型｜状态）：')
    for (const s of p.screens) {
      lines.push(`- ${s.id}｜${s.name}｜${s.kind === 'overlay' ? `浮层(${s.overlayType})` : '页面'}｜${s.states.map((st) => `${st.id}:${st.name}`).join(', ')}${s.id === p.entryId ? '｜入口' : ''}${s.description ? `｜${s.description}` : ''}`)
      if (opts.layouts) {
        for (const st of s.states) {
          const ids: string[] = []
          const walk = (e: { id: string; type: string; label?: string; children?: unknown[] }) => {
            if (['button', 'listItem', 'icon', 'card', 'search', 'input', 'avatar', 'image', 'select', 'menubar', 'toolbar', 'tree', 'table'].includes(e.type) && (e.label || ['menubar', 'toolbar', 'tree', 'table'].includes(e.type))) ids.push(`${e.id}(${e.type}「${e.label ?? ''}」)`)
            ;(e.children as typeof e[] | undefined)?.forEach(walk)
          }
          walk(st.root)
          if (ids.length) lines.push(`    ${st.id} 可交互元素：${ids.slice(0, 20).join('，')}`)
        }
      }
    }
  }
  if (p.conditions.length) lines.push(`判断节点：${p.conditions.map((c) => `${c.id}「${c.label}」`).join('，')}`)
  if (p.transitions.length) {
    lines.push('连线（id｜起点[状态]→终点[状态]｜文字｜类型）：')
    for (const t of p.transitions) lines.push(`- ${t.id}｜${t.from}${t.fromState ? `[${t.fromState}]` : ''}→${t.to}${t.toState ? `[${t.toState}]` : ''}｜${t.label ?? t.branch ?? ''}｜${t.action}/${t.kind}${t.elementId ? `｜元素 ${t.elementId}` : ''}`)
  }
  return lines.join('\n')
}

// ---- step 1: features --------------------------------------------------------

export function featuresPrompt(p: Project) {
  return [
    { role: 'system' as const, content: BASE },
    {
      role: 'user' as const,
      content: `${projectSummary(p)}

第 1 步：把需求拆成用户角色和功能清单（5-10 个功能点，按重要程度排序），并给项目起一个简短名字。
输出格式：
{"name":"项目名","roles":["角色"],"features":[{"name":"功能名","description":"一句话说明"}]}`,
    },
  ]
}

export function featuresToOps(v: unknown): PatchOp[] {
  const o = v as { name?: string; roles?: string[]; features?: { name: string; description?: string }[] }
  if (!Array.isArray(o?.features) || !o.features.length) throw new Error('缺少 features 数组')
  const ops: PatchOp[] = [{ op: 'setFeatures', features: o.features.filter((f) => f?.name), roles: Array.isArray(o.roles) ? o.roles.map(String) : [] }]
  if (o.name) ops.push({ op: 'renameProject', name: String(o.name) })
  return ops
}

// ---- step 2: sitemap -----------------------------------------------------------

export function sitemapPrompt(p: Project) {
  return [
    { role: 'system' as const, content: BASE },
    {
      role: 'user' as const,
      content: `${projectSummary(p)}

第 2 步：设计页面结构。列出实现上述功能所需的全部页面和浮层（弹窗 modal / 底部抽屉 sheet / 侧边抽屉 drawer / 轻提示 toast）。
- 每个页面列出它的关键状态：第一个必须是 {"id":"default","name":"默认"}，再补充对交互逻辑有意义的状态，如 empty(空)、failed(失败)、full(已满) 等。每个页面最多 3 个状态；通用的「加载中」不要列。
- 确认、登录拦截、选择器这类不应该是整页的，做成浮层。
- id 用英文小写短横线。entry 是用户打开应用看到的第一个页面。
- 一般 6-12 个节点，覆盖主要功能即可，不要为次要功能单独开页面。
输出格式：
{"entry":"home","screens":[{"id":"home","name":"首页","kind":"page","description":"一句话","states":[{"id":"default","name":"默认"}]},{"id":"login","name":"登录","kind":"overlay","overlayType":"modal","states":[{"id":"default","name":"默认"}]}]}`,
    },
  ]
}

export function sitemapToOps(v: unknown, p: Project): PatchOp[] {
  const o = v as { entry?: string; screens?: { id: string; name: string; kind?: string; overlayType?: string; description?: string; states?: { id: string; name: string }[] }[] }
  if (!Array.isArray(o?.screens) || !o.screens.length) throw new Error('缺少 screens 数组')
  const ops: PatchOp[] = []
  const existing = new Set(p.screens.map((s) => s.id))
  for (const s of o.screens) {
    if (!s?.name) continue
    if (s.id && existing.has(s.id)) {
      ops.push({ op: 'updateScreen', id: s.id, name: s.name, description: s.description })
      const cur = p.screens.find((x) => x.id === s.id)!
      for (const st of s.states ?? []) if (st?.id && !cur.states.some((x) => x.id === st.id)) ops.push({ op: 'addState', screenId: s.id, state: st })
      continue
    }
    ops.push({
      op: 'addScreen',
      screen: {
        id: s.id,
        name: s.name,
        kind: s.kind === 'overlay' ? 'overlay' : 'page',
        overlayType: (['modal', 'sheet', 'drawer', 'toast'].includes(s.overlayType ?? '') ? s.overlayType : 'modal') as 'modal',
        description: s.description,
        states: (s.states ?? []).filter((st) => st?.id).map((st) => ({ id: st.id, name: st.name })),
      },
    })
  }
  if (o.entry) ops.push({ op: 'setEntry', id: o.entry })
  return ops
}

// ---- step 3: flows -------------------------------------------------------------

export function flowsPrompt(p: Project) {
  return [
    { role: 'system' as const, content: BASE },
    {
      role: 'user' as const,
      content: `${projectSummary(p, { layouts: true })}

第 3 步：设计交互流程。用连线描述页面之间怎么走，重点是完整的操作逻辑而不是只有一条主路径，但要克制，让流程图一眼能看懂：
- 只在真正影响去向的业务决策处加判断节点（菱形），如「已登录？」「支付成功？」「课程已满？」。判断节点总数不超过页面数的一半，最多 8 个。
- 不要为加载成功/失败、有无数据这类页面内状态加判断节点，直接用 setState 连线或在 toState 上表达。
- 判断节点的每条出线用 branch 标「是」/「否」。
- 连线总数控制在页面数的 2.5 倍以内；同一对页面之间最多 2 条。
- 每个页面状态都要说明怎么进入（例如 toState:"empty"），出错状态要有重试或取消的出路（kind:"error"）。
- 返回/取消用 kind:"back"。浮层用 action:"open" 打开，用 action:"close"（from 和 to 都是浮层自身）关闭。
- 同一页面内状态切换用 action:"setState"，from 和 to 相同，用 fromState/toState。
- 如果已列出可交互元素，用 elementId 指明哪个元素触发。
- 不要重复已经存在的连线；只输出需要新增的部分。
- trigger 取值：tap | submit | swipe | longpress | auto | back | condition
输出格式：
{"conditions":[{"id":"logged-in","label":"已登录？"}],
 "transitions":[{"from":"cart","to":"logged-in","label":"去结算","elementId":"cart-checkout"},{"from":"logged-in","to":"checkout","branch":"是"},{"from":"logged-in","to":"login","branch":"否","action":"open"},{"from":"pay-ok","to":"checkout","toState":"failed","branch":"否","kind":"error"}]}`,
    },
  ]
}

export function flowsToOps(v: unknown): PatchOp[] {
  const o = v as { conditions?: { id: string; label: string }[]; transitions?: Record<string, unknown>[] }
  if (!Array.isArray(o?.transitions)) throw new Error('缺少 transitions 数组')
  const ops: PatchOp[] = []
  for (const c of o.conditions ?? []) if (c?.label) ops.push({ op: 'addCondition', condition: { id: String(c.id ?? ''), label: String(c.label) } })
  for (const t of o.transitions) if (t?.from && t?.to) ops.push({ op: 'addTransition', transition: t as never })
  return ops
}

// ---- step 4: layouts -----------------------------------------------------------

export function layoutPrompt(p: Project, screenId: string, stateIds?: string[]) {
  const s = p.screens.find((x) => x.id === screenId)
  if (!s) throw new Error(`页面不存在: ${screenId}`)
  const states = s.states.filter((st) => !stateIds || stateIds.includes(st.id))
  const outgoing = p.transitions.filter((t) => t.from === screenId).map((t) => `${t.fromState ?? DEFAULT_STATE} 状态：${t.label ?? t.branch ?? t.action} → ${p.screens.find((x) => x.id === t.to)?.name ?? p.conditions.find((c) => c.id === t.to)?.label ?? t.to}${t.elementId ? `（元素 id 必须为 ${t.elementId}）` : ''}`)
  return [
    { role: 'system' as const, content: BASE },
    {
      role: 'user' as const,
      content: `${projectSummary(p)}

第 4 步：为「${s.name}」(${s.kind === 'overlay' ? `浮层 ${s.overlayType}` : DEVICES[p.device].hint}) 生成低保真线框布局。
${s.description ? `页面说明：${s.description}\n` : ''}需要生成的状态：${states.map((st) => `${st.id}(${st.name})`).join('、')}
这个页面上的交互（布局里要有对应元素）：
${outgoing.length ? outgoing.join('\n') : '（暂无）'}

${LAYOUT_RULES}${elementDoc()}
用户组件库（优先使用）：
${libraryDoc(p)}

输出格式（每个状态一棵树）：
{"states":{"default":{"type":"column","children":[{"type":"header","label":"标题","props":{"back":true}},{"type":"column","props":{"pad":16,"gap":12,"grow":true},"children":[...]}]}}}`,
    },
  ]
}

export function layoutToOps(v: unknown, screenId: string, allowed: string[]): PatchOp[] {
  const o = v as { states?: Record<string, unknown> }
  const states = o?.states && typeof o.states === 'object' ? o.states : (v as Record<string, unknown>)
  const ops: PatchOp[] = []
  for (const [stateId, root] of Object.entries(states ?? {})) {
    if (!allowed.includes(stateId) || !root || typeof root !== 'object') continue
    ops.push({ op: 'setLayout', screenId, stateId, root })
  }
  if (!ops.length) throw new Error(`没有返回任何状态的布局，需要：${allowed.join(', ')}`)
  return ops
}

// ---- chat: free-form edits ---------------------------------------------------------

export function chatPrompt(p: Project, history: { role: 'user' | 'assistant'; content: string }[], focus?: string) {
  return [
    {
      role: 'system' as const,
      content: `${BASE}
你在一个交互设计工具里，用户会用自然语言要求修改设计。你要把要求变成一组修改操作，供用户确认后执行。
如果用户只是提问，ops 为空数组，在 reply 里回答。
可用操作（按顺序执行，后面的操作可以引用前面新建的 id）：
- {"op":"addScreen","screen":{"id","name","kind":"page|overlay","overlayType":"modal|sheet|drawer|toast","description","states":[{"id":"default","name":"默认"}]}}
- {"op":"updateScreen","id","name"?,"description"?,"kind"?,"overlayType"?}
- {"op":"removeScreen","id"}
- {"op":"addState","screenId","state":{"id","name"}}
- {"op":"removeState","screenId","stateId"}
- {"op":"setLayout","screenId","stateId","root":<元素树>}
- {"op":"addTransition","transition":{"from","to","fromState"?,"toState"?,"elementId"?,"label"?,"branch"?,"trigger"?,"action":"navigate|open|close|back|setState","kind":"normal|error|back"}}
- {"op":"updateTransition","id","changes":{...}}
- {"op":"removeTransition","id"}
- {"op":"addCondition","condition":{"id","label"}}
- {"op":"updateCondition","id","label"} / {"op":"removeCondition","id"}
- {"op":"setEntry","id"}
新增页面时，同时补上进入和离开它的连线，并用 setLayout 给出默认状态的布局。
插入页面到两个页面之间时，删除原来的直连线（removeTransition）再连新线。

${LAYOUT_RULES}${elementDoc()}
用户组件库：
${libraryDoc(p)}

输出格式：{"reply":"简短说明你做了什么","summary":"一句话概括修改","ops":[...]}`,
    },
    { role: 'user' as const, content: `当前设计：\n${projectSummary(p, { layouts: true })}${focus ? `\n\n用户当前正在看：${focus}` : ''}` },
    { role: 'assistant' as const, content: '{"reply":"好的，我已了解当前设计。","summary":"","ops":[]}' },
    ...history,
  ]
}

export interface ChatResult {
  reply: string
  summary: string
  ops: PatchOp[]
}

export function parseChat(v: unknown): ChatResult {
  const o = v as { reply?: string; summary?: string; ops?: unknown[] }
  if (typeof o !== 'object' || o === null) throw new Error('输出不是对象')
  const ops = Array.isArray(o.ops) ? (o.ops.filter((x) => x && typeof x === 'object' && 'op' in (x as object)) as PatchOp[]) : []
  return { reply: String(o.reply ?? ''), summary: String(o.summary ?? o.reply ?? ''), ops }
}
