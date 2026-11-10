import type { WElement } from '../model/types'
import { isContainer } from '../model/elements'

// Deterministic box layout for wireframe trees. The LLM only describes structure;
// sizes and positions are computed here (flex-like: column/row, gap, pad, grow).

export interface Box {
  el: WElement
  x: number
  y: number
  w: number
  h: number
  depth: number
}

const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : d)

/** Approximate text width (CJK chars are wider). */
/** Approximate text width (calibrated against PingFang / YaHei at weight 500). */
export function textWidth(s: string, size = 13) {
  let w = 0
  for (const ch of s) {
    if (/[⺀-￿]/.test(ch)) w += size
    else if (ch === ' ') w += size * 0.3
    else if (/[0-9]/.test(ch)) w += size * 0.6
    else if (/[A-Z]/.test(ch)) w += size * 0.64
    else if (/[il.,:;'|!]/.test(ch)) w += size * 0.3
    else w += size * 0.54
  }
  return w
}

/** Number of lines `s` wraps into at width w (char-level, same rule as the painter). */
export function wrapCount(s: string, w: number, size: number): number {
  let n = 0
  for (const para of s.split(/\n/)) {
    let line = ''
    n++
    for (const ch of para) {
      if (line && textWidth(line + ch, size) > w) {
        n++
        line = ch
      } else line += ch
    }
  }
  return n
}

/** Intrinsic height of a leaf at a given width. */
function leafHeight(el: WElement, w: number): number {
  const p = el.props ?? {}
  switch (el.type) {
    case 'header':
      return 52
    case 'nav':
      return 56
    case 'title': {
      const size = p.size === 'lg' ? 22 : p.size === 'sm' ? 15 : 18
      return Math.min(3, wrapCount(el.label ?? '', Math.max(40, w), size)) * (size + 8)
    }
    case 'text': {
      if (el.label) {
        return Math.min(6, wrapCount(el.label, Math.max(40, w), 13)) * 19
      }
      return num(p.lines, 2) * 14
    }
    case 'button':
      return p.variant === 'text' ? 28 : p.size === 'lg' ? 64 : p.size === 'sm' ? 32 : 44
    case 'input':
    case 'search':
      return 42
    case 'image':
      return num(p.h, 140)
    case 'listItem':
      return p.sub ? 64 : 52
    case 'tabbar':
      return 58
    case 'tabs':
      return 38
    case 'icon':
      return num(p.size, 24)
    case 'avatar':
      return num(p.size, 40)
    case 'badge':
      return 24
    case 'toggle':
    case 'checkbox':
      return 36
    case 'divider':
      return 1
    case 'spacer':
      return 0
    case 'table':
      return 36 + num(p.rows, 4) * 34
    case 'chart':
      return num(p.h, 160)
    case 'select':
      return 38
    case 'radio': {
      const n = String(p.items ?? '').split(/[,，]/).filter(Boolean).length || 2
      return p.dir === 'column' ? n * 30 : 30
    }
    case 'slider':
      return el.label ? 44 : 24
    case 'progress':
      return el.label ? 34 : 10
    case 'stepper':
      return 52
    case 'pagination':
      return 34
    case 'breadcrumb':
      return 22
    case 'titlebar':
      return 32
    case 'menubar':
      return 28
    case 'toolbar':
      return p.labels ? 52 : 38
    case 'tree': {
      const n = String(p.items ?? '').split(/[,，]/).filter(Boolean).length || 4
      return num(p.h, n * 26 + 8)
    }
    case 'statusbar':
      return 24
    case 'splitter':
      return 6
    default:
      return 24
  }
}

/** Intrinsic width used when a leaf sits in a row and does not grow. */
function leafWidth(el: WElement): number | undefined {
  const p = el.props ?? {}
  if (p.w != null) return num(p.w, 0)
  switch (el.type) {
    case 'icon':
      return num(p.size, 24)
    case 'avatar':
      return num(p.size, 40)
    case 'badge':
      return textWidth(el.label ?? '标签', 12) + 20
    case 'button': {
      const fs = p.size === 'lg' ? 18 : p.size === 'sm' ? 12 : 14
      // text width (+ icon) + padding; slight overestimate so labels don't clip
      return Math.max(p.size === 'sm' ? 56 : 72, textWidth(el.label ?? '按钮', fs) * 1.04 + (p.icon ? fs + 6 : 0) + 32)
    }
    case 'title': {
      const size = p.size === 'lg' ? 22 : p.size === 'sm' ? 15 : 18
      return textWidth(el.label ?? '', size) + 4
    }
    case 'text':
      return el.label ? textWidth(el.label, 13) + 4 : undefined
    case 'toggle':
    case 'checkbox':
      return undefined
    case 'splitter':
      return 6
    case 'divider':
      return 1
    case 'pagination':
      return Math.min(9, num(p.pages, 5)) * 34 + 64
    case 'breadcrumb':
      return String(p.items ?? '').split(/[,，]/).reduce((a, s) => a + textWidth(s.trim(), 12) + 22, 0)
    case 'select':
      return num(p.w, 0) || undefined
    case 'image':
      return p.w != null ? num(p.w, 80) : undefined
    default:
      return undefined
  }
}

function grows(el: WElement, inRow: boolean) {
  const g = el.props?.grow
  if (g === true || g === 1 || g === 'true') return true
  if (el.type === 'spacer') return true
  // a tree without a fixed height fills the column it sits in (sidebar pattern)
  if (!inRow && el.type === 'tree' && el.props?.h == null) return true
  if (inRow) return leafWidth(el) === undefined && !(isContainer(el.type) && (el.props?.w != null || intrinsicRowWidth(el) !== undefined))
  return false
}

interface Measured {
  el: WElement
  h: number
}

/** Height a node will take at width w. */
export function measure(el: WElement, w: number): number {
  if (!isContainer(el.type)) return leafHeight(el, w)
  const p = el.props ?? {}
  const pad = num(p.pad, el.type === 'card' ? 12 : 0)
  const gap = num(p.gap, el.type === 'card' ? 6 : 8)
  const kids = el.children ?? []
  const innerW = Math.max(0, w - pad * 2)
  if (p.h != null) return num(p.h, 0)
  if (kids.length === 0) return Math.max(pad * 2, el.type === 'card' ? 60 : 24)
  if (el.type === 'row') {
    const widths = rowWidths(el, innerW)
    let h = 0
    kids.forEach((k, i) => (h = Math.max(h, measure(k, widths[i]))))
    return h + pad * 2
  }
  let h = 0
  for (const k of kids) h += measure(k, innerW)
  return h + gap * (kids.length - 1) + pad * 2
}

/** Natural width of a row container: sum of its fixed-width children (used when a row sits inside a row). */
function intrinsicRowWidth(el: WElement): number | undefined {
  if (el.type !== 'row' || el.props?.grow) return undefined
  const kids = el.children ?? []
  if (!kids.length) return undefined
  let total = 0
  for (const k of kids) {
    const w = isContainer(k.type) ? (num(k.props?.w, 0) || intrinsicRowWidth(k)) : leafWidth(k)
    if (w === undefined || k.type === 'spacer') return undefined
    total += w
  }
  return total + num(el.props?.gap, 8) * (kids.length - 1) + num(el.props?.pad, 0) * 2
}

function rowWidths(el: WElement, innerW: number): number[] {
  const kids = el.children ?? []
  const gap = num(el.props?.gap, 8)
  // nested rows of buttons/badges keep their natural width instead of splitting the space evenly
  const fixed = kids.map((k) => (k.props?.grow ? undefined : isContainer(k.type) ? num(k.props?.w, 0) || intrinsicRowWidth(k) : grows(k, true) ? undefined : leafWidth(k)))
  const avail = innerW - gap * Math.max(0, kids.length - 1)
  let used = fixed.reduce<number>((a, b) => a + (b ?? 0), 0)
  // fixed items that overflow the row are shrunk proportionally (text gets clipped with …)
  // dividers in a row are 1px vertical rules, not flexible space
  kids.forEach((k, i) => {
    if (k.type === 'divider') fixed[i] = 1
  })
  const nonSpacerFlex = kids.filter((k, i) => fixed[i] === undefined && k.type !== 'spacer').length
  if (used > avail - nonSpacerFlex * 40 && used > 0) {
    const k = Math.max(0.2, (avail - nonSpacerFlex * 40) / used)
    for (let i = 0; i < fixed.length; i++) if (fixed[i] !== undefined) fixed[i] = fixed[i]! * k
    used = fixed.reduce<number>((a, b) => a + (b ?? 0), 0)
  }
  // spacers take leftover space only after real flexible items get theirs
  const rest = Math.max(0, avail - used)
  if (nonSpacerFlex > 0) {
    const each = Math.max(20, rest / nonSpacerFlex)
    return kids.map((k, i) => fixed[i] ?? (k.type === 'spacer' ? 0 : each))
  }
  const spacers = fixed.filter((f) => f === undefined).length
  const each = spacers ? rest / spacers : 0
  return fixed.map((f) => f ?? each)
}

/** Lay out a root at a fixed frame size. Returns boxes in paint order. */
export function layoutTree(root: WElement, frameW: number, frameH: number): Box[] {
  const boxes: Box[] = []
  place(root, 0, 0, frameW, frameH, 0, boxes, true)
  return boxes
}

function place(el: WElement, x: number, y: number, w: number, h: number, depth: number, out: Box[], isRoot = false) {
  out.push({ el, x, y, w, h, depth })
  if (!isContainer(el.type)) return
  const p = el.props ?? {}
  const pad = num(p.pad, el.type === 'card' ? 12 : 0)
  const gap = num(p.gap, el.type === 'card' ? 6 : isRoot ? 0 : 8)
  const kids = el.children ?? []
  const ix = x + pad
  const iy = y + pad
  const iw = Math.max(0, w - pad * 2)
  const ih = Math.max(0, h - pad * 2)

  if (el.type === 'row') {
    const widths = rowWidths(el, iw)
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1)
    const align = p.align
    let cx = ix
    let g = gap
    if (align === 'center') cx = ix + Math.max(0, (iw - total) / 2)
    else if (align === 'end') cx = ix + Math.max(0, iw - total)
    else if (align === 'between' && kids.length > 1) g = gap + Math.max(0, (iw - total) / (kids.length - 1))
    kids.forEach((k, i) => {
      // containers, splitters and vertical-fill leaves (tree) stretch to the row height
      const stretch = isContainer(k.type) || k.type === 'splitter' || k.type === 'divider' || (k.type === 'tree' && k.props?.h == null)
      const kh = stretch ? Math.max(isContainer(k.type) ? measure(k, widths[i]) : 0, ih) : measure(k, widths[i])
      const ky = iy + (stretch ? 0 : Math.max(0, (ih - kh) / 2))
      place(k, cx, ky, widths[i], stretch ? ih : kh, depth + 1, out)
      cx += widths[i] + g
    })
    return
  }

  // column: measure kids, distribute leftover height to growing kids
  const ms: Measured[] = kids.map((k) => ({ el: k, h: measure(k, iw) }))
  const used = ms.reduce((a, m) => a + m.h, 0) + gap * Math.max(0, kids.length - 1)
  const growers = ms.filter((m) => grows(m.el, false))
  const extra = Math.max(0, ih - used)
  if (growers.length && extra > 0) growers.forEach((m) => (m.h += extra / growers.length))
  let cy = iy
  // column align: center/end positions fixed-width leaves horizontally; icons and
  // avatars are always centered when the column itself is centered
  const align = p.align
  for (const m of ms) {
    const lw = isContainer(m.el.type) ? undefined : fixedLeafWidth(m.el)
    if (lw !== undefined && lw < iw && (align === 'center' || align === 'end')) {
      const lx = align === 'center' ? ix + (iw - lw) / 2 : ix + iw - lw
      place(m.el, lx, cy, lw, m.h, depth + 1, out)
    } else place(m.el, ix, cy, iw, m.h, depth + 1, out)
    cy += m.h + gap
  }
}

/** Width of leaves that look wrong stretched (icons, avatars, badges, short text) when the column is aligned. */
function fixedLeafWidth(el: WElement): number | undefined {
  if (['icon', 'avatar', 'badge'].includes(el.type)) return leafWidth(el)
  if (el.type === 'title' || el.type === 'text' || el.type === 'button') {
    if (el.props?.w != null) return num(el.props.w, 0)
    return el.type === 'button' ? undefined : leafWidth(el)
  }
  return undefined
}

/** Content height (for scrolling previews taller than the device frame). */
export function contentHeight(root: WElement, frameW: number, frameH: number) {
  return Math.max(frameH, measure(root, frameW))
}
