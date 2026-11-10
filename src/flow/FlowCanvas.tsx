import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  ReactFlow,
  getBezierPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkProject } from '../model/check'
import type { Transition } from '../model/types'
import { useProject, useStore } from '../store'
import { autoLayout } from './autoLayout'
import { ConditionNode, ScreenNode } from './nodes'

const nodeTypes = { screen: ScreenNode, condition: ConditionNode }

const EDGE_COLOR = { normal: '#2563eb', error: '#dc2626', back: '#8a8a8a' }

interface EdgeData extends Record<string, unknown> {
  t: Transition
  text: string
}

function FlowEdge(props: EdgeProps & { data: EdgeData }) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd, id } = props
  const t = data.t
  const color = EDGE_COLOR[t.kind]
  let path: string
  let lx: number
  let ly: number
  if (t.from === t.to) {
    // self loop above the node
    const r = 40
    path = `M ${sourceX} ${sourceY} C ${sourceX + r * 2} ${sourceY - r * 3}, ${targetX - r * 2} ${targetY - r * 3}, ${targetX} ${targetY}`
    lx = (sourceX + targetX) / 2
    ly = sourceY - r * 2.3
  } else {
    ;[path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  }
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: selected ? 2.6 : 1.6, strokeDasharray: t.kind === 'normal' ? undefined : '6 4' }} />
      {data.text && (
        <EdgeLabelRenderer>
          <div className={`elabel ${t.kind} ${selected ? 'sel' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${lx}px,${ly}px)` }}>
            {data.text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { flow: FlowEdge }

function edgeText(t: Transition, stateName: (sid: string, st?: string) => string | undefined) {
  const parts: string[] = []
  if (t.branch) parts.push(t.branch)
  if (t.label) parts.push(t.label)
  if (!t.label && !t.branch) {
    if (t.action === 'close') parts.push('关闭')
    else if (t.action === 'back') parts.push('返回')
  }
  const fs = t.fromState ? stateName(t.from, t.fromState) : undefined
  const ts = t.toState ? stateName(t.to, t.toState) : undefined
  if (t.action === 'setState' && t.from === t.to) {
    return `${parts.join(' · ')}${fs || ts ? `（${fs ?? '默认'}→${ts ?? '默认'}）` : ''}`
  }
  let s = parts.join(' · ')
  if (fs) s = `[${fs}] ${s}`
  if (ts) s = `${s} →[${ts}]`
  return s.trim()
}

function Inner() {
  const project = useProject()
  const update = useStore((s) => s.update)
  const patch = useStore((s) => s.patch)
  const select = useStore((s) => s.select)
  const sel = useStore((s) => s.sel)
  const rf = useReactFlow()
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({})
  const laidOut = useRef<string>('')

  const issues = useMemo(() => checkProject(project), [project])
  const issueBy = useMemo(() => {
    const m: Record<string, 'error' | 'warning' | 'info'> = {}
    const rank = { error: 3, warning: 2, info: 1 }
    for (const i of issues) if (i.targetId && (!m[i.targetId] || rank[i.level] > rank[m[i.targetId]])) m[i.targetId] = i.level
    return m
  }, [issues])

  // auto-layout any node that has no stored position
  const ids = [...project.screens.map((s) => s.id), ...project.conditions.map((c) => c.id)]
  const missing = ids.filter((id) => !project.positions[id])
  const missingKey = missing.join(',')
  useEffect(() => {
    if (!missing.length || laidOut.current === project.id + missingKey) return
    laidOut.current = project.id + missingKey
    autoLayout(project).then((pos) => {
      const allMissing = missing.length === ids.length
      update((p) => {
        const positions = { ...p.positions }
        if (allMissing) Object.assign(positions, pos)
        else {
          // place new nodes relative to the layout, shifted so they don't overlap kept nodes
          for (const id of missing) positions[id] = pos[id] ?? { x: 0, y: 0 }
        }
        return { ...p, positions }
      }, false)
      if (allMissing) window.setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 60)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, missingKey])

  const nodes: Node[] = useMemo(() => {
    const out: Node[] = []
    for (const s of project.screens) {
      out.push({
        id: s.id,
        type: 'screen',
        position: dragPos[s.id] ?? project.positions[s.id] ?? { x: 0, y: 0 },
        data: { screen: s, entry: s.id === project.entryId, issue: issueBy[s.id] },
        selected: sel.nodeId === s.id,
      })
    }
    for (const c of project.conditions) {
      out.push({
        id: c.id,
        type: 'condition',
        position: dragPos[c.id] ?? project.positions[c.id] ?? { x: 0, y: 0 },
        data: { label: c.label, issue: issueBy[c.id] },
        selected: sel.nodeId === c.id,
      })
    }
    return out
  }, [project, dragPos, issueBy, sel.nodeId])

  const edges: Edge[] = useMemo(() => {
    const stateName = (sid: string, st?: string) => project.screens.find((s) => s.id === sid)?.states.find((x) => x.id === st)?.name
    return project.transitions.map((t) => ({
      id: t.id,
      source: t.from,
      target: t.to,
      type: 'flow',
      data: { t, text: edgeText(t, stateName) },
      selected: sel.edgeId === t.id,
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR[t.kind], width: 18, height: 18 },
    }))
  }, [project.transitions, project.screens, sel.edgeId])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // live drag positions stay local; the store is written once on drag stop (one undo step)
      for (const c of changes) {
        if (c.type === 'position' && c.position && c.dragging) {
          const pos = c.position
          setDragPos((d) => ({ ...d, [c.id]: pos }))
        }
      }
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      update((p) => ({ ...p, positions: { ...p.positions, [node.id]: node.position } }))
      setDragPos((d) => {
        const n = { ...d }
        delete n[node.id]
        return n
      })
    },
    [update],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return
      const fromCond = project.conditions.some((x) => x.id === c.source)
      const existing = project.transitions.filter((t) => t.from === c.source).length
      const errs = patch([
        {
          op: 'addTransition',
          transition: fromCond ? { from: c.source, to: c.target, branch: existing === 0 ? '是' : existing === 1 ? '否' : '其他' } : { from: c.source, to: c.target, label: '' },
        },
      ])
      if (!errs.length) {
        const t = useStore.getState().project().transitions.at(-1)
        if (t) select({ edgeId: t.id })
      }
    },
    [patch, project, select],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onNodeClick={(_, n) => select({ nodeId: n.id })}
      onEdgeClick={(_, e) => select({ edgeId: e.id })}
      onPaneClick={() => select({})}
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1.2} color="#d4d4d4" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable style={{ width: 180, height: 110 }} nodeColor={(n) => (n.type === 'condition' ? '#fbbf24' : '#a3a3a3')} nodeStrokeWidth={0} maskColor="rgba(240,240,240,0.7)" />
    </ReactFlow>
  )
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  )
}

/** Re-run auto layout for the whole graph. */
export async function relayout() {
  const st = useStore.getState()
  const pos = await autoLayout(st.project())
  st.update((p) => ({ ...p, positions: pos }))
}
