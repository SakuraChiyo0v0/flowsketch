import type { Project, Transition } from '../model/types'
import { DEFAULT_STATE, DEVICE_SIZE } from '../model/types'
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
  const cols = p.device === 'mobile' ? 5 : 2
  let x = gap
  let y = gap + 30
  let rowH = 0
  let W = 0
  let body = ''
  items.forEach((it, i) => {
    if (i > 0 && i % cols === 0) {
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
export function exportSpec(p: Project) {
  const name = (id: string) => p.screens.find((s) => s.id === id)?.name ?? p.conditions.find((c) => c.id === id)?.label ?? id
  const lines = [`# ${p.name}`, '', p.brief, '']
  if (p.features.length) {
    lines.push('## 功能清单', '')
    for (const f of p.features) lines.push(`- **${f.name}**${f.description ? `：${f.description}` : ''}`)
    lines.push('')
  }
  lines.push('## 页面', '')
  for (const s of p.screens) {
    lines.push(`### ${s.name}${s.kind === 'overlay' ? `（${OVERLAY_LABEL[s.overlayType ?? 'modal']}）` : ''}${s.id === p.entryId ? ' · 入口' : ''}`, '')
    if (s.description) lines.push(s.description, '')
    if (s.states.length > 1) lines.push(`状态：${s.states.map((x) => x.name).join('、')}`, '')
    const outs = p.transitions.filter((t) => t.from === s.id)
    if (outs.length) {
      lines.push('| 状态 | 触发 | 去向 | 说明 |', '|---|---|---|---|')
      for (const t of outs) lines.push(`| ${s.states.find((x) => x.id === (t.fromState ?? DEFAULT_STATE))?.name ?? ''} | ${t.trigger} / ${t.action} | ${name(t.to)}${t.toState ? `[${p.screens.find((x) => x.id === t.to)?.states.find((x) => x.id === t.toState)?.name}]` : ''} | ${t.label ?? ''} |`)
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
  download(`${safe(p.name)}-交互说明.md`, lines.join('\n'), 'text/markdown')
}
