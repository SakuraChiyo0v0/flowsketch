import { useEffect } from 'react'
import { FlowCanvas } from './flow/FlowCanvas'
import { PageEditor } from './page/PageEditor'
import { AiPanel } from './panels/AiPanel'
import { Inspector } from './panels/Inspector'
import { Sidebar } from './panels/Sidebar'
import { TopBar } from './panels/TopBar'
import { findParent, removeFromTree } from './model/elements'
import { useStore } from './store'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      const st = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const { sel, view } = st
        const p = st.project()
        if (view === 'page' && sel.elementId) {
          const scr = p.screens.find((s) => s.id === st.screenId)
          const state = scr?.states.find((s) => s.id === st.stateId)
          if (!scr || !state || state.root.id === sel.elementId) return
          const parent = findParent(state.root, sel.elementId)
          st.update((x) => ({
            ...x,
            screens: x.screens.map((s) => (s.id === scr.id ? { ...s, states: s.states.map((y) => (y.id === state.id ? { ...y, root: removeFromTree(y.root, sel.elementId!) } : y)) } : s)),
          }))
          st.select(parent ? { elementId: parent.id } : {})
        } else if (view === 'flow' && sel.edgeId) {
          st.patch([{ op: 'removeTransition', id: sel.edgeId }])
          st.select({})
        } else if (view === 'flow' && sel.nodeId) {
          const isCond = p.conditions.some((c) => c.id === sel.nodeId)
          const name = p.screens.find((s) => s.id === sel.nodeId)?.name ?? p.conditions.find((c) => c.id === sel.nodeId)?.label
          if (!confirm(`删除「${name}」和它的连线？`)) return
          st.patch([isCond ? { op: 'removeCondition', id: sel.nodeId } : { op: 'removeScreen', id: sel.nodeId }])
          st.select({})
        }
      } else if (e.key === 'Escape') {
        st.select({})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function FlowToolbar() {
  const add = (op: Parameters<ReturnType<typeof useStore.getState>['patch']>[0][number], kind: 'screen' | 'cond') => {
    const st = useStore.getState()
    st.patch([op])
    const p = useStore.getState().project()
    st.select({ nodeId: kind === 'screen' ? p.screens.at(-1)?.id : p.conditions.at(-1)?.id })
  }
  return (
    <div className="float-bar">
      <button className="btn ghost sm" onClick={() => add({ op: 'addScreen', screen: { id: '', name: '新页面' } }, 'screen')}>
        ▯ 页面
      </button>
      <button className="btn ghost sm" onClick={() => add({ op: 'addScreen', screen: { id: '', name: '新弹窗', kind: 'overlay', overlayType: 'modal' } }, 'screen')}>
        ◱ 浮层
      </button>
      <button className="btn ghost sm" onClick={() => add({ op: 'addCondition', condition: { id: '', label: '条件？' } }, 'cond')}>
        ◇ 判断
      </button>
      <span className="legend">
        <i className="lg normal" />主流程 <i className="lg back" />返回 <i className="lg error" />出错
      </span>
    </div>
  )
}

export default function App() {
  useShortcuts()
  const view = useStore((s) => s.view)
  const toast = useStore((s) => s.toast)
  const empty = useStore((s) => s.projects[s.currentId].screens.length === 0)
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Sidebar />
        <section className="center">
          {view === 'flow' ? (
            <>
              <FlowCanvas />
              <FlowToolbar />
              {empty && (
                <div className="center-empty">
                  <div className="ce-title">从一句话开始</div>
                  <div className="ce-desc">在右侧「引导生成」里描述你的软件，AI 会一步步生成功能、页面结构、交互流程和线框。也可以用左上角工具栏手动添加页面。</div>
                </div>
              )}
            </>
          ) : (
            <PageEditor />
          )}
        </section>
        <aside className="right">
          <Inspector />
          <AiPanel />
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
