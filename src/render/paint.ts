import type { WElement } from '../model/types'
import { layoutTree, textWidth, type Box } from './layout'

// Grayscale low-fidelity painter. Output is SVG markup so the editor, the flow
// thumbnails and the exporter all draw identically.

export const C = {
  ink: '#262626',
  mid: '#737373',
  line: '#a3a3a3',
  soft: '#d4d4d4',
  fill: '#f0f0f0',
  fill2: '#e5e5e5',
  bg: '#ffffff',
  accent: '#2563eb',
}

export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const FONT = `font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"`

function clip(s: string, maxW: number, size: number) {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

function text(x: number, y: number, s: string, opt: { size?: number; color?: string; weight?: number; anchor?: string; maxW?: number } = {}) {
  const size = opt.size ?? 13
  const str = opt.maxW ? clip(s, opt.maxW, size) : s
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${opt.color ?? C.ink}" ${FONT}${opt.weight ? ` font-weight="${opt.weight}"` : ''}${opt.anchor ? ` text-anchor="${opt.anchor}"` : ''} dominant-baseline="middle">${esc(str)}</text>`
}

function rect(x: number, y: number, w: number, h: number, opt: { fill?: string; stroke?: string; r?: number; dash?: boolean; sw?: number } = {}) {
  return `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" rx="${opt.r ?? 0}" fill="${opt.fill ?? 'none'}"${opt.stroke ? ` stroke="${opt.stroke}" stroke-width="${opt.sw ?? 1}"` : ''}${opt.dash ? ' stroke-dasharray="4 3"' : ''}/>`
}

function lines(x: number, y: number, w: number, n: number) {
  let s = ''
  for (let i = 0; i < n; i++) {
    const lw = i === n - 1 && n > 1 ? w * 0.6 : w
    s += rect(x, y + i * 14 + 3, lw, 7, { fill: C.fill2, r: 3.5 })
  }
  return s
}

// 24x24 stroke icons
const ICONS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5 12l5 5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  heart: 'M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-3 4.5 4.5 0 0 1 9 3c-2 4.5-9 9-9 9z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zm4 3a2 2 0 0 0 4 0',
  settings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M5 19l2-2M17 7l2-2',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  check: 'M5 12l5 5 9-10',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  mail: 'M3 6h18v12H3zm0 0l9 7 9-7',
  chevron: 'M9 6l6 6-6 6',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  location: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  play: 'M7 4l13 8-13 8z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  send: 'M3 11l18-8-8 18-2-8z',
  lock: 'M6 11h12v10H6zm2 0V7a4 4 0 0 1 8 0v4',
  image: 'M4 5h16v14H4zm0 11l5-5 4 4 3-3 4 4',
  file: 'M6 3h8l4 4v14H6zm8 0v4h4',
  grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
}

export function iconNames() {
  return Object.keys(ICONS)
}

export function icon(name: string, x: number, y: number, size: number, color = C.ink) {
  const key = name in ICONS ? name : 'grid'
  const s = size / 24
  return `<path d="${ICONS[key]}" transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${1.8 / Math.max(s, 0.4)}" stroke-linecap="round" stroke-linejoin="round"/>`
}

function items(v: unknown, d: string) {
  return String(v ?? d)
    .split(/[,，、|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const TAB_ICONS: Record<string, string> = {
  首页: 'home', 主页: 'home', 发现: 'search', 搜索: 'search', 我的: 'user', 个人: 'user', 购物车: 'cart', 消息: 'chat', 通知: 'bell', 设置: 'settings', 订单: 'list', 收藏: 'heart', 分类: 'grid',
}

function paintBox(b: Box): string {
  const { el, x, y, w, h } = b
  const p = el.props ?? {}
  const label = el.label ?? ''
  switch (el.type) {
    case 'column':
    case 'row':
      return p.border ? rect(x, y, w, h, { stroke: C.soft, r: 6 }) : p.fill ? rect(x, y, w, h, { fill: C.fill }) : ''
    case 'card':
      return rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: C.bg, stroke: C.soft, r: 8 })
    case 'header': {
      let s = rect(x, y, w, h, { fill: C.bg }) + `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${C.soft}"/>`
      if (p.back !== false) s += icon('back', x + 12, y + h / 2 - 10, 20)
      s += text(x + w / 2, y + h / 2, label, { size: 16, weight: 600, anchor: 'middle', maxW: w - 100 })
      if (p.action) s += icon(String(p.action), x + w - 34, y + h / 2 - 10, 20)
      return s
    }
    case 'nav': {
      let s = rect(x, y, w, h, { fill: C.bg }) + `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${C.soft}"/>`
      s += rect(x + 20, y + h / 2 - 12, 24, 24, { fill: C.fill2, r: 6 }) + text(x + 52, y + h / 2, label || 'Logo', { size: 15, weight: 600 })
      let cx = x + 52 + textWidth(label || 'Logo', 15) + 40
      for (const it of items(p.items, '首页,产品,关于')) {
        s += text(cx, y + h / 2, it, { size: 13, color: C.mid })
        cx += textWidth(it, 13) + 28
      }
      if (p.action) s += rect(x + w - 108, y + h / 2 - 16, 88, 32, { fill: C.ink, r: 6 }) + text(x + w - 64, y + h / 2, String(p.action), { size: 13, color: C.bg, anchor: 'middle', maxW: 80 })
      return s
    }
    case 'title': {
      const size = p.size === 'lg' ? 22 : p.size === 'sm' ? 15 : 18
      return text(x, y + h / 2, label, { size, weight: 600, maxW: w })
    }
    case 'text':
      if (label) return text(x, y + Math.min(h, 19) / 2 + 1, label, { size: 13, color: C.mid, maxW: w })
      return lines(x, y, w, Number(p.lines ?? 2))
    case 'button': {
      const v = p.variant ?? 'primary'
      if (v === 'text') return text(x + w / 2, y + h / 2, label, { size: 14, color: C.ink, anchor: 'middle', weight: 500, maxW: w })
      const filled = v === 'primary'
      return rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: filled ? C.ink : C.bg, stroke: filled ? undefined : C.line, r: 8 }) + text(x + w / 2, y + h / 2, label, { size: 14, color: filled ? C.bg : C.ink, anchor: 'middle', weight: 500, maxW: w - 16 })
    }
    case 'input':
      return rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: C.bg, stroke: C.line, r: 8 }) + text(x + 12, y + h / 2, label || '请输入', { size: 13, color: C.line, maxW: w - 24 })
    case 'search':
      return rect(x, y, w, h, { fill: C.fill, r: h / 2 }) + icon('search', x + 12, y + h / 2 - 9, 18, C.mid) + text(x + 38, y + h / 2, label || '搜索', { size: 13, color: C.line, maxW: w - 50 })
    case 'image': {
      return rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: C.fill, stroke: C.soft, r: 6 }) + `<path d="M${x + 1} ${y + 1}L${x + w - 1} ${y + h - 1}M${x + w - 1} ${y + 1}L${x + 1} ${y + h - 1}" stroke="${C.soft}"/>` + (label ? text(x + w / 2, y + h / 2, label, { size: 12, color: C.mid, anchor: 'middle', maxW: w - 16 }) : '')
    }
    case 'listItem': {
      let s = rect(x, y, w, h, { fill: C.bg }) + `<line x1="${x + 12}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${C.fill2}"/>`
      let tx = x + 12
      if (p.thumb !== false) {
        const ts = h - 20
        s += rect(x + 12, y + 10, ts, ts, { fill: C.fill2, r: 6 })
        tx += ts + 12
      }
      const right = (p.chevron !== false ? 28 : 12) + (p.trailing ? textWidth(String(p.trailing), 13) + 8 : 0)
      if (p.sub) {
        s += text(tx, y + h / 2 - 10, label, { size: 14, weight: 500, maxW: x + w - right - tx })
        s += text(tx, y + h / 2 + 11, String(p.sub), { size: 12, color: C.mid, maxW: x + w - right - tx })
      } else s += text(tx, y + h / 2, label, { size: 14, maxW: x + w - right - tx })
      if (p.trailing) s += text(x + w - (p.chevron !== false ? 30 : 12), y + h / 2, String(p.trailing), { size: 13, color: C.mid, anchor: 'end' })
      if (p.chevron !== false) s += icon('chevron', x + w - 26, y + h / 2 - 8, 16, C.line)
      return s
    }
    case 'tabbar': {
      const its = items(p.items, '首页,发现,我的')
      const active = Number(p.active ?? 0)
      let s = rect(x, y, w, h, { fill: C.bg }) + `<line x1="${x}" y1="${y + 0.5}" x2="${x + w}" y2="${y + 0.5}" stroke="${C.soft}"/>`
      const cw = w / its.length
      its.forEach((it, i) => {
        const cx = x + cw * i + cw / 2
        const col = i === active ? C.ink : C.line
        s += icon(TAB_ICONS[it] ?? 'grid', cx - 11, y + 8, 22, col) + text(cx, y + 42, it, { size: 11, color: col, anchor: 'middle', maxW: cw - 4 })
      })
      return s
    }
    case 'tabs': {
      const its = items(p.items, '全部,进行中,已完成')
      const active = Number(p.active ?? 0)
      let s = `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${C.fill2}"/>`
      const cw = w / its.length
      its.forEach((it, i) => {
        const cx = x + cw * i + cw / 2
        s += text(cx, y + h / 2, it, { size: 13, color: i === active ? C.ink : C.mid, anchor: 'middle', weight: i === active ? 600 : 400, maxW: cw - 6 })
        if (i === active) s += rect(cx - 14, y + h - 3, 28, 3, { fill: C.ink, r: 1.5 })
      })
      return s
    }
    case 'icon': {
      const sz = Math.min(w, h)
      return icon(label || 'star', x + (w - sz) / 2, y + (h - sz) / 2, sz)
    }
    case 'avatar': {
      const r = Math.min(w, h) / 2
      return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${r}" fill="${C.fill2}"/>` + icon('user', x + w / 2 - r * 0.6, y + h / 2 - r * 0.6, r * 1.2, C.line)
    }
    case 'badge':
      return rect(x, y, w, h, { fill: C.fill, stroke: C.soft, r: h / 2 }) + text(x + w / 2, y + h / 2, label, { size: 12, color: C.mid, anchor: 'middle', maxW: w - 10 })
    case 'toggle': {
      const on = p.on !== false
      return text(x, y + h / 2, label, { size: 14, maxW: w - 60 }) + rect(x + w - 44, y + h / 2 - 12, 44, 24, { fill: on ? C.ink : C.fill2, r: 12 }) + `<circle cx="${on ? x + w - 12 : x + w - 32}" cy="${y + h / 2}" r="9" fill="${C.bg}"/>`
    }
    case 'checkbox': {
      const on = p.checked === true
      return rect(x + 0.5, y + h / 2 - 9, 18, 18, { fill: on ? C.ink : C.bg, stroke: C.line, r: 4 }) + (on ? icon('check', x + 2, y + h / 2 - 7, 14, C.bg) : '') + text(x + 28, y + h / 2, label, { size: 14, maxW: w - 30 })
    }
    case 'divider':
      return `<line x1="${x}" y1="${y + 0.5}" x2="${x + w}" y2="${y + 0.5}" stroke="${C.soft}"/>`
    case 'spacer':
      return ''
    case 'table': {
      const cols = items(p.cols, '名称,状态,时间')
      const rows = Number(p.rows ?? 4)
      let s = rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: C.bg, stroke: C.soft, r: 6 }) + rect(x + 1, y + 1, w - 2, 35, { fill: C.fill })
      const cw = w / cols.length
      cols.forEach((c, i) => (s += text(x + cw * i + 12, y + 18, c, { size: 12, weight: 600, color: C.mid, maxW: cw - 16 })))
      for (let r = 0; r < rows; r++) {
        const ry = y + 36 + r * 34
        s += `<line x1="${x}" y1="${ry}" x2="${x + w}" y2="${ry}" stroke="${C.fill2}"/>`
        cols.forEach((_, i) => (s += rect(x + cw * i + 12, ry + 13, Math.min(cw - 30, 80 - ((r + i) % 3) * 15), 8, { fill: C.fill2, r: 4 })))
      }
      return s
    }
    case 'chart': {
      let s = rect(x + 0.5, y + 0.5, w - 1, h - 1, { fill: C.bg, stroke: C.soft, r: 6 })
      const kind = p.kind ?? 'bar'
      const px = x + 16
      const pw = w - 32
      const py = y + 16
      const ph = h - 32
      if (kind === 'pie') {
        const r = Math.min(pw, ph) / 2
        const cx = x + w / 2
        const cy = y + h / 2
        s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.fill2}"/><path d="M${cx} ${cy}L${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx + r * 0.95} ${cy + r * 0.31}Z" fill="${C.line}"/>`
      } else if (kind === 'line') {
        const pts = [0.7, 0.5, 0.6, 0.3, 0.4, 0.15].map((v, i) => `${px + (pw / 5) * i},${py + ph * v}`).join(' ')
        s += `<polyline points="${pts}" fill="none" stroke="${C.mid}" stroke-width="2"/>`
      } else {
        const vals = [0.5, 0.8, 0.35, 0.65, 0.9, 0.45]
        const bw = pw / vals.length
        vals.forEach((v, i) => (s += rect(px + bw * i + bw * 0.2, py + ph * (1 - v), bw * 0.6, ph * v, { fill: C.fill2, r: 2 })))
      }
      return s
    }
    default:
      return ''
  }
}

/** Paint a tree into a frame. `scrollH` lets the page be taller than the device. */
export function paintTree(root: WElement, w: number, h: number): { svg: string; boxes: Box[] } {
  const boxes = layoutTree(root, w, h)
  return { svg: boxes.map(paintBox).join(''), boxes }
}

/** Complete standalone SVG document for one screen state. */
export function screenSvg(root: WElement, w: number, h: number, title?: string) {
  const { svg } = paintTree(root, w, h)
  const top = title ? 32 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + top}" viewBox="0 0 ${w} ${h + top}">${title ? text(0, 14, title, { size: 14, weight: 600 }) : ''}<g transform="translate(0 ${top})"><clipPath id="f"><rect width="${w}" height="${h}" rx="12"/></clipPath><rect width="${w}" height="${h}" rx="12" fill="#fff" stroke="${C.line}"/><g clip-path="url(#f)">${svg}</g></g></svg>`
}
