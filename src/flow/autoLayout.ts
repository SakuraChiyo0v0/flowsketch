import ELK from 'elkjs/lib/elk.bundled.js'
import type { Project } from '../model/types'
import { useStore } from '../store'

const elk = new ELK()

export const NODE_SIZE = {
  page: { w: 168, h: 330 },
  overlay: { w: 168, h: 200 },
  condition: { w: 120, h: 96 },
}

const WEB_SIZE = {
  page: { w: 300, h: 228 },
  overlay: { w: 220, h: 180 },
}

export function nodeSize(p: Project, id: string) {
  const s = p.screens.find((x) => x.id === id)
  if (!s) return NODE_SIZE.condition
  const table = p.device === 'mobile' ? NODE_SIZE : WEB_SIZE
  return s.kind === 'overlay' ? table.overlay : table.page
}

/** Rendered height of a node: title + frame + optional state-chip rows. */
export function nodeHeight(p: Project, id: string) {
  const sz = nodeSize(p, id)
  const scr = p.screens.find((s) => s.id === id)
  if (!scr) return sz.h
  if (scr.states.length <= 1) return sz.h + 8
  // chips wrap: estimate rows from total chip width
  const chipsW = scr.states.reduce((a, st) => a + st.name.length * 11 + 22, 0)
  const rows = Math.ceil(chipsW / (sz.w - 12))
  return sz.h + 6 + rows * 25
}

/** Layered left-to-right layout. The LLM never computes coordinates. */
export async function autoLayout(p: Project): Promise<Record<string, { x: number; y: number }>> {
  const ids = [...p.screens.map((s) => s.id), ...p.conditions.map((c) => c.id)]
  const idSet = new Set(ids)
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: ids.map((id) => ({ id, width: nodeSize(p, id).w, height: nodeHeight(p, id) })),
    // back/close edges distort layering, so leave them out of the layout graph
    edges: p.transitions
      .filter((t) => t.from !== t.to && idSet.has(t.from) && idSet.has(t.to) && t.kind !== 'back' && t.action !== 'close')
      .map((t) => ({ id: t.id, sources: [t.from], targets: [t.to] })),
  }
  // entry first so it lands in the left-most layer
  if (p.entryId) graph.children.sort((a, b) => (a.id === p.entryId ? -1 : b.id === p.entryId ? 1 : 0))
  const res = await elk.layout(graph)
  const out: Record<string, { x: number; y: number }> = {}
  for (const c of res.children ?? []) out[c.id] = { x: c.x ?? 0, y: c.y ?? 0 }
  return wrapTallLayers(p, out)
}

/**
 * Hub-shaped graphs (one page opening many overlays — typical for desktop apps) produce
 * a single very tall layer. Split such layers into several columns so the graph stays
 * roughly as wide as it is tall.
 */
function wrapTallLayers(p: Project, pos: Record<string, { x: number; y: number }>) {
  const ids = Object.keys(pos)
  if (ids.length < 6) return pos
  // group by x (layers)
  const layers = new Map<number, string[]>()
  for (const id of ids) {
    const x = Math.round(pos[id].x)
    layers.set(x, [...(layers.get(x) ?? []), id])
  }
  const xs = [...layers.keys()].sort((a, b) => a - b)
  const height = (id: string) => nodeHeight(p, id) + 50
  const totalW = xs.length
  const out: Record<string, { x: number; y: number }> = {}
  let shift = 0
  for (const x of xs) {
    const col = layers.get(x)!.sort((a, b) => pos[a].y - pos[b].y)
    const colH = col.reduce((a, id) => a + height(id), 0)
    // target column height: aspect ~ 16:10 of the whole graph
    const widest = Math.max(...col.map((id) => nodeSize(p, id).w))
    const target = Math.max(900, (totalW + 1) * (widest + 110) * 0.62)
    const splits = Math.min(4, Math.max(1, Math.ceil(colH / target)))
    if (splits === 1) {
      for (const id of col) out[id] = { x: pos[id].x + shift, y: pos[id].y }
      continue
    }
    const per = Math.ceil(col.length / splits)
    const colW = widest + 70
    for (let i = 0; i < col.length; i++) {
      const k = Math.floor(i / per)
      const inCol = col.slice(k * per, (k + 1) * per)
      // each sub-column is stacked and vertically centered on the original column
      const subH = inCol.reduce((a, id) => a + height(id), 0)
      const mid = (Math.min(...col.map((id) => pos[id].y)) + Math.max(...col.map((id) => pos[id].y + height(id)))) / 2
      let y = mid - subH / 2
      for (const id of inCol) {
        if (id === col[i]) break
        y += height(id)
      }
      out[col[i]] = { x: x + shift + k * colW, y }
    }
    shift += (splits - 1) * colW
  }
  // keep top-left at the origin-ish so fitView behaves
  const minY = Math.min(...Object.values(out).map((v) => v.y))
  for (const id of Object.keys(out)) out[id] = { x: out[id].x, y: out[id].y - minY }
  return out
}

/** Re-run auto layout for the whole graph (one undoable step). */
export async function relayout() {
  const st = useStore.getState()
  const pos = await autoLayout(st.project())
  st.update((p) => ({ ...p, positions: pos }))
}
