import ELK from 'elkjs/lib/elk.bundled.js'
import type { Project } from '../model/types'
import { useStore } from '../store'

const elk = new ELK()

export const NODE_SIZE = {
  page: { w: 168, h: 330 },
  overlay: { w: 168, h: 200 },
  condition: { w: 120, h: 96 },
}

export function nodeSize(p: Project, id: string) {
  const s = p.screens.find((x) => x.id === id)
  if (!s) return NODE_SIZE.condition
  return s.kind === 'overlay' ? NODE_SIZE.overlay : NODE_SIZE.page
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
    children: ids.map((id) => {
      const sz = nodeSize(p, id)
      return { id, width: sz.w, height: sz.h + 28 }
    }),
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
  return out
}

/** Re-run auto layout for the whole graph (one undoable step). */
export async function relayout() {
  const st = useStore.getState()
  const pos = await autoLayout(st.project())
  st.update((p) => ({ ...p, positions: pos }))
}
