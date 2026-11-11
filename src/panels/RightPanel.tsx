import { useState } from 'react'
import { useStore } from '../store'
import { AiPanel } from './AiPanel'
import { Inspector } from './Inspector'

/**
 * Right side: one tab at a time instead of stacking properties above the AI panel,
 * so each gets the full height. Selecting something switches to 属性 automatically;
 * the AI tab remembers its own sub-tab (guide / chat / check).
 */
export function RightPanel() {
  const sel = useStore((s) => s.sel)
  const [tab, setTab] = useState<'props' | 'ai'>('ai')
  // follow the selection: picking a node/edge/element shows its properties
  const selKey = sel.nodeId ?? sel.edgeId ?? sel.elementId ?? ''
  const [lastSel, setLastSel] = useState(selKey)
  if (selKey !== lastSel) {
    setLastSel(selKey)
    if (selKey) setTab('props')
  }
  // a new pending AI proposal or a running AI step pulls the AI tab forward
  const busy = useStore((s) => s.busy)
  const [lastBusy, setLastBusy] = useState(busy)
  if (busy !== lastBusy) {
    setLastBusy(busy)
    if (busy) setTab('ai')
  }
  return (
    <aside className="right-panel">
      <div className="right-tabs">
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
          ✦ AI 助手
        </button>
        <button className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}>
          属性{selKey ? <span className="dot" /> : null}
        </button>
      </div>
      <div className="right-body">{tab === 'props' ? <Inspector /> : <AiPanel />}</div>
    </aside>
  )
}
