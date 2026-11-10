import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { Screen } from '../model/types'
import { DEVICE_SIZE, DEFAULT_STATE } from '../model/types'
import { Thumb } from '../render/Thumb'
import { frameSize, OVERLAY_LABEL } from '../render/frame'
import { useStore } from '../store'
import { NODE_SIZE, nodeSize } from './autoLayout'

export interface ScreenNodeData extends Record<string, unknown> {
  screen: Screen
  entry: boolean
  issue?: 'error' | 'warning' | 'info'
}

export interface CondNodeData extends Record<string, unknown> {
  label: string
  issue?: 'error' | 'warning' | 'info'
}

export const ScreenNode = memo(function ScreenNode({ data, selected }: NodeProps & { data: ScreenNodeData }) {
  const project = useStore((s) => s.projects[s.currentId])
  const openScreen = useStore((s) => s.openScreen)
  const { screen, entry, issue } = data
  const overlay = screen.kind === 'overlay'
  const size = nodeSize(project, screen.id)
  const def = screen.states.find((s) => s.id === DEFAULT_STATE) ?? screen.states[0]
  const fs = overlay ? frameSize(project, screen, def.id) : DEVICE_SIZE[project.device]
  const thumbW = overlay ? size.w - 24 : size.w - 12
  const extra = screen.states.length - 1
  const naturalH = (thumbW / fs.w) * (overlay ? fs.h : DEVICE_SIZE[project.device].h)
  const frameH = Math.min(size.h - 30, naturalH)
  return (
    <div className={`fnode ${overlay ? 'overlay' : 'page'} ${selected ? 'sel' : ''} ${issue ? `issue-${issue}` : ''}`} style={{ width: size.w }} onDoubleClick={() => openScreen(screen.id)}>
      <Handle type="target" position={Position.Left} style={{ top: 24 + (size.h - 24) / 2 }} />
      <div className="fnode-title">
        {entry && <span className="entry-dot" title="入口页">▶</span>}
        {!entry && screen.externalEntry && <span className="entry-dot ext" title="外部入口">↗</span>}
        <span className="name">{screen.name}</span>
        {overlay && <span className="tag">{OVERLAY_LABEL[screen.overlayType ?? 'modal']}</span>}
      </div>
      {/* fixed frame height so node sizes are predictable for auto layout; tall content is clipped */}
      <div className={`fnode-frame ${extra > 0 ? 'stacked' : ''}`} style={{ height: frameH }}>
        <Thumb root={def.root} w={fs.w} h={Math.min(fs.h, overlay ? fs.h : DEVICE_SIZE[project.device].h)} width={thumbW} />
      </div>
      {screen.states.length > 1 && (
        <div className="fnode-states">
          {screen.states.map((st) => (
            <button
              key={st.id}
              className={`chip ${/失败|错误|error|fail/i.test(st.name + st.id) ? 'err' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                openScreen(screen.id, st.id)
              }}
            >
              {st.name}
            </button>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ top: 24 + (size.h - 24) / 2 }} />
    </div>
  )
})

export const ConditionNode = memo(function ConditionNode({ data, selected }: NodeProps & { data: CondNodeData }) {
  const { w, h } = NODE_SIZE.condition
  return (
    <div className={`cnode ${selected ? 'sel' : ''} ${data.issue ? `issue-${data.issue}` : ''}`} style={{ width: w, height: h }}>
      <Handle type="target" position={Position.Left} />
      <svg width={w} height={h} className="diamond">
        <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`} />
      </svg>
      <div className="clabel">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
})
