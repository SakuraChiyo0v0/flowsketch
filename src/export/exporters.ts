import type { Project, Transition } from '../model/types'
import { DEFAULT_STATE, DEVICE_SIZE, DEVICES } from '../model/types'
import { C, esc, paintTree } from '../render/paint'
import { frameSize, OVERLAY_LABEL } from '../render/frame'
import { nodeSize } from '../flow/autoLayout'
import { textWidth } from '../render/layout'

const FONT = `font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"`
const EDGE = { normal: '#2563eb', error: '#dc2626', back: '#8a8a8a' }

export function download(name: string, data: string | Blob, mime = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safe(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '_')
}

/** Whole flow diagram as one SVG (thumbnails + edges), matching the canvas layout. */
export function flowSvg(p: Project, opts: { showSelf?: boolean } = {}): string {
  const ids = [...p.screens.map((s) => s.id), ...p.conditions.map((c) => c.id)]
  if (!ids.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"/>'
  const pos = (id: string) => p.positions[id] ?? { x: 0, y: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const nodeH = (id: string) => nodeSize(p, id).h + ((p.screens.find((s) => s.id === id)?.states.length ?? 0) > 1 ? 30 : 0)
  for (const id of ids) {
    const { x, y } = pos(id)
    const sz = nodeSize(p, id)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + sz.w)
    maxY = Math.max(maxY, y + nodeH(id))
  }
  const pad = 60
  const ox = pad - minX
  const oy = pad + 30 - minY
  const W = maxX - minX + pad * 2
  const H = maxY - minY + pad * 2 + 30

  const anchor = (id: string, side: 'in' | 'out') => {
    const { x, y } = pos(id)
    const sz = nodeSize(p, id)
    const isCond = !p.screens.some((s) => s.id === id)
    const cy = isCond ? sz.h / 2 : sz.h / 2 + 10
    return { x: x + ox + (side === 'out' ? sz.w : 0), y: y + oy + cy }
  }

  let defs = ''
  for (const [k, c] of Object.entries(EDGE)) defs += `<marker id="a-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`

  let edges = ''
  let labels = ''
  const label = (t: Transition) => [t.branch, t.label].filter(Boolean).join(' · ') || (t.action === 'close' ? '关闭' : t.action === 'back' ? '返回' : '')
  for (const t of p.transitions) {
    if (!ids.includes(t.from) || !ids.includes(t.to)) continue
    if (t.from === t.to && !opts.showSelf) continue
    const a = anchor(t.from, 'out')
    const b = anchor(t.to, 'in')
    const col = EDGE[t.kind]
    let d: string
    let lx: number
    let ly: number
    if (t.from === t.to) {
      const r = 40
      d = `M ${a.x} ${a.y} C ${a.x + r * 2} ${a.y - r * 3}, ${b.x - r * 2} ${b.y - r * 3}, ${b.x} ${b.y}`
      lx = (a.x + b.x) / 2
      ly = a.y - r * 2.3
    } else {
      const dx = Math.max(60, Math.abs(b.x - a.x) * 0.35)
      d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
      lx = (a.x + b.x) / 2
      ly = (a.y + b.y) / 2
    }
    edges += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"${t.kind !== 'normal' ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#a-${t.kind})"/>`
    const txt = label(t)
    if (txt) {
      const w = textWidth(txt, 11) + 12
      labels += `<rect x="${lx - w / 2}" y="${ly - 10}" width="${w}" height="20" rx="10" fill="#fff" stroke="${col}" stroke-opacity="0.5"/><text x="${lx}" y="${ly}" font-size="11" fill="${col}" text-anchor="middle" dominant-baseline="middle" ${FONT}>${esc(txt)}</text>`
    }
  }

  let nodes = ''
  for (const s of p.screens) {
    const { x, y } = pos(s.id)
    const sz = nodeSize(p, s.id)
    const X = x + ox
    const Y = y + oy
    const overlay = s.kind === 'overlay'
    const def = s.states.find((st) => st.id === DEFAULT_STATE) ?? s.states[0]
    const fs = overlay ? frameSize(p, s, def.id) : DEVICE_SIZE[p.device]
    const tw = overlay ? sz.w - 24 : sz.w - 12
    const sc = tw / fs.w
    const th = Math.min(fs.h * sc, sz.h - 40)
    const title = `${s.id === p.entryId ? '▶ ' : ''}${s.name}${overlay ? ` · ${OVERLAY_LABEL[s.overlayType ?? 'modal']}` : ''}`
    nodes += `<g><text x="${X + 4}" y="${Y + 8}" font-size="13" font-weight="600" fill="${C.ink}" dominant-baseline="middle" ${FONT}>${esc(title)}</text>`
    const fx = X + (sz.w - tw) / 2
    const fy = Y + 22
    if (s.states.length > 1) nodes += `<rect x="${fx + 6}" y="${fy - 6}" width="${tw}" height="${th}" rx="8" fill="#fafafa" stroke="${C.soft}"/>`
    nodes += `<clipPath id="c-${s.id}"><rect x="${fx}" y="${fy}" width="${tw}" height="${th}" rx="8"/></clipPath>`
    nodes += `<rect x="${fx}" y="${fy}" width="${tw}" height="${th}" rx="8" fill="#fff" stroke="${overlay ? C.line : C.soft}"${overlay ? ' stroke-dasharray="5 3"' : ''}/>`
    nodes += `<g clip-path="url(#c-${s.id})"><g transform="translate(${fx} ${fy}) scale(${sc})">${paintTree(def.root, fs.w, fs.h).svg}</g></g>`
    if (s.states.length > 1) {
      let cx = fx
      const cy = fy + th + 14
      for (const st of s.states) {
        const w = textWidth(st.name, 10) + 12
        const err = /失败|错误|error|fail/i.test(st.name + st.id)
        nodes += `<rect x="${cx}" y="${cy - 9}" width="${w}" height="18" rx="9" fill="${err ? '#fef2f2' : C.fill}" stroke="${err ? '#fca5a5' : C.soft}"/><text x="${cx + w / 2}" y="${cy}" font-size="10" fill="${err ? '#b91c1c' : C.mid}" text-anchor="middle" dominant-baseline="middle" ${FONT}>${esc(st.name)}</text>`
        cx += w + 4
      }
    }
    nodes += '</g>'
  }
  for (const c of p.conditions) {
    const { x, y } = pos(c.id)
    const { w, h } = nodeSize(p, c.id)
    const X = x + ox
    const Y = y + oy
    nodes += `<polygon points="${X + w / 2},${Y} ${X + w},${Y + h / 2} ${X + w / 2},${Y + h} ${X},${Y + h / 2}" fill="#fffbeb" stroke="#d97706" stroke-width="1.5"/><text x="${X + w / 2}" y="${Y + h / 2}" font-size="12" fill="#92400e" text-anchor="middle" dominant-baseline="middle" ${FONT}>${esc(c.label)}</text>`
  }

  const header = `<text x="${pad}" y="34" font-size="18" font-weight="700" fill="${C.ink}" ${FONT}>${esc(p.name)}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="#fafafa"/>${header}${edges}${nodes}${labels}</svg>`
}

/** One SVG per screen state, laid out as a sheet (for handing off page-level wireframes). */
export function pagesSheetSvg(p: Project): string {
  const gap = 48
  const items: { title: string; svg: string; w: number; h: number }[] = []
  for (const s of p.screens)
    for (const st of s.states) {
      const fs = frameSize(p, s, st.id)
      items.push({ title: `${s.name}${s.states.length > 1 ? ` · ${st.name}` : ''}`, svg: paintTree(st.root, fs.w, fs.h).svg, w: fs.w, h: fs.h })
    }
  // wrap rows by width (not a fixed column count) so small overlays pack next to each other
  const dev = DEVICE_SIZE[p.device]
  const maxW = p.device === 'mobile' ? (dev.w + gap) * 5 : (dev.w + gap) * 2 + gap
  let x = gap
  let y = gap + 30
  let rowH = 0
  let W = 0
  let body = ''
  items.forEach((it, i) => {
    if (x > gap && x + it.w > maxW) {
      x = gap
      y += rowH + gap + 28
      rowH = 0
    }
    body += `<text x="${x}" y="${y - 12}" font-size="14" font-weight="600" fill="${C.ink}" ${FONT}>${esc(it.title)}</text><clipPath id="s${i}"><rect x="${x}" y="${y}" width="${it.w}" height="${it.h}" rx="12"/></clipPath><rect x="${x}" y="${y}" width="${it.w}" height="${it.h}" rx="12" fill="#fff" stroke="${C.line}"/><g clip-path="url(#s${i})"><g transform="translate(${x} ${y})">${it.svg}</g></g>`
    x += it.w + gap
    W = Math.max(W, x)
    rowH = Math.max(rowH, it.h)
  })
  const H = y + rowH + gap
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fafafa"/><text x="${gap}" y="34" font-size="18" font-weight="700" fill="${C.ink}" ${FONT}>${esc(p.name)} · 页面线框</text>${body}</svg>`
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/)
  const w = m ? +m[1] : 1000
  const h = m ? +m[2] : 800
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('SVG 渲染失败'))
    img.src = url
  })
  const maxSide = 16000
  const s = Math.min(scale, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * s)
  canvas.height = Math.round(h * s)
  const ctx = canvas.getContext('2d')!
  ctx.scale(s, s)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG 导出失败'))), 'image/png'))
}

export function exportJson(p: Project) {
  download(`${safe(p.name)}.flowsketch.json`, JSON.stringify(p, null, 2), 'application/json')
}

export async function exportFlow(p: Project, fmt: 'svg' | 'png', showSelf = false) {
  const svg = flowSvg(p, { showSelf })
  if (fmt === 'svg') download(`${safe(p.name)}-流程图.svg`, svg, 'image/svg+xml')
  else download(`${safe(p.name)}-流程图.png`, await svgToPng(svg))
}

export async function exportPages(p: Project, fmt: 'svg' | 'png') {
  const svg = pagesSheetSvg(p)
  if (fmt === 'svg') download(`${safe(p.name)}-页面线框.svg`, svg, 'image/svg+xml')
  else download(`${safe(p.name)}-页面线框.png`, await svgToPng(svg))
}

/** Markdown spec: features, pages, states, and every transition. Useful to hand to developers or another AI. */
const TRIGGER_CN: Record<string, string> = { tap: '点击', submit: '提交', swipe: '滑动', longpress: '长按', auto: '自动', back: '返回键', condition: '条件' }
const ACTION_CN: Record<string, string> = { navigate: '跳转到', open: '打开', close: '关闭', back: '返回', setState: '切换为' }

export function specMarkdown(p: Project): string {
  const name = (id: string) => p.screens.find((s) => s.id === id)?.name ?? p.conditions.find((c) => c.id === id)?.label ?? id
  const stName = (sid: string, st?: string) => (st ? p.screens.find((x) => x.id === sid)?.states.find((x) => x.id === st)?.name : undefined)
  const elLabel = (sid: string, elId?: string) => {
    if (!elId) return undefined
    for (const st of p.screens.find((x) => x.id === sid)?.states ?? []) {
      let found: string | undefined
      const visit = (e: { id: string; label?: string; type: string; children?: unknown[] }) => {
        if (e.id === elId) found = e.label ? `「${e.label}」` : e.type
        ;(e.children as (typeof e)[] | undefined)?.forEach(visit)
      }
      visit(st.root)
      if (found) return found
    }
    return undefined
  }
  const dest = (t: Project['transitions'][number]) => {
    if (t.action === 'close') return '关闭当前浮层'
    if (t.action === 'setState' && t.from === t.to) return `切换为「${stName(t.to, t.toState) ?? '默认'}」状态`
    const cond = p.conditions.find((c) => c.id === t.to)
    if (cond) {
      const branches = p.transitions.filter((x) => x.from === cond.id).map((x) => `${x.branch ?? '?'} → ${name(x.to)}${x.toState ? `（${stName(x.to, x.toState)}）` : ''}`)
      return `判断「${cond.label}」：${branches.join('；') || '（未连分支）'}`
    }
    const st = stName(t.to, t.toState)
    return `${ACTION_CN[t.action] ?? ''}「${name(t.to)}」${st ? `（${st}）` : ''}`
  }
  const lines = [`# ${p.name}`, '', `> ${DEVICES[p.device].name} · ${p.screens.filter((s) => s.kind === 'page').length} 个页面 · ${p.screens.filter((s) => s.kind === 'overlay').length} 个浮层 · ${p.conditions.length} 个判断`, '']
  if (p.brief) lines.push(p.brief, '')
  if (p.roles?.length) lines.push(`**用户角色**：${p.roles.join('、')}`, '')
  if (p.features.length) {
    lines.push('## 功能清单', '')
    for (const f of p.features) lines.push(`- **${f.name}**${f.description ? `：${f.description}` : ''}`)
    lines.push('')
  }
  lines.push('## 页面与交互', '')
  // entry first, then pages, then overlays
  const ordered = [...p.screens].sort((a, b) => (a.id === p.entryId ? -1 : b.id === p.entryId ? 1 : a.kind === b.kind ? 0 : a.kind === 'page' ? -1 : 1))
  for (const s of ordered) {
    lines.push(`### ${s.name}${s.kind === 'overlay' ? `（${OVERLAY_LABEL[s.overlayType ?? 'modal']}）` : ''}${s.id === p.entryId ? ' · 入口' : ''}`, '')
    if (s.description) lines.push(s.description, '')
    if (s.states.length > 1) lines.push(`**状态**：${s.states.map((x) => x.name).join('、')}`, '')
    // real entry paths only: skip back edges, and resolve condition nodes to the pages before them
    const ins = p.transitions.filter((t) => t.to === s.id && t.from !== s.id && t.kind !== 'back')
    const via = (t: Project['transitions'][number]) => {
      const c = p.conditions.find((x) => x.id === t.from)
      if (!c) return [name(t.from) + (t.toState ? `（进入${stName(s.id, t.toState)}）` : '')]
      return p.transitions.filter((x) => x.to === c.id && x.from !== s.id).map((x) => `${name(x.from)}（${c.label.replace(/[？?]$/, '')}：${t.branch ?? ''}）`)
    }
    if (ins.length) lines.push(`**进入方式**：${[...new Set(ins.flatMap(via))].join('、')}`, '')
    const outs = p.transitions.filter((t) => t.from === s.id)
    if (outs.length) {
      const multi = s.states.length > 1
      lines.push(multi ? '| 状态 | 操作 | 结果 | 类型 |' : '| 操作 | 结果 | 类型 |', multi ? '|---|---|---|---|' : '|---|---|---|')
      for (const t of outs) {
        const el = elLabel(s.id, t.elementId)
        const what = el ?? (t.label ? `「${t.label}」` : '')
        const op = t.trigger === 'tap' ? `点击${what}` : t.trigger === 'auto' ? `自动${t.label ? `（${t.label}）` : ''}` : `${TRIGGER_CN[t.trigger] ?? t.trigger}${what}`
        const kind = t.kind === 'error' ? '出错' : t.kind === 'back' ? '返回' : '主流程'
        const note = el && t.label && `「${t.label}」` !== el ? `（${t.label}）` : ''
        const row = [op || '—', dest(t) + note, kind]
        if (multi) row.unshift(stName(s.id, t.fromState) ?? '默认')
        lines.push(`| ${row.join(' | ')} |`)
      }
      lines.push('')
    }
  }
  if (p.conditions.length) {
    lines.push('## 判断', '')
    for (const c of p.conditions) {
      lines.push(`- **${c.label}**`)
      for (const t of p.transitions.filter((x) => x.from === c.id)) lines.push(`  - ${t.branch ?? ''} → ${name(t.to)}${t.toState ? `[${p.screens.find((x) => x.id === t.to)?.states.find((x) => x.id === t.toState)?.name}]` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function exportSpec(p: Project) {
  download(`${safe(p.name)}-交互说明.md`, specMarkdown(p), 'text/markdown')
}
