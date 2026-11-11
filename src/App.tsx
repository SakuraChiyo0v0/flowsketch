import { ErrorBoundary } from './ErrorBoundary'
import { useEffect } from 'react'
import { FlowCanvas } from './flow/FlowCanvas'
import { PageEditor } from './page/PageEditor'
import { RightPanel } from './panels/RightPanel'
import { Sidebar } from './panels/Sidebar'
import { TopBar } from './panels/TopBar'
import { findParent, removeFromTree, starterRoot } from './model/elements'
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

function EmptyCanvas() {
  const busy = useStore((s) => s.busy)
  const features = useStore((s) => s.projects[s.currentId].features)
  if (busy)
    return (
      <div className="center-empty">
        <div className="ce-title">
          <span className="spin" /> AI 正在生成
        </div>
        <div className="ce-desc">{busy}</div>
        {features.length > 0 && (
          <div className="ce-features">
            {features.map((f) => (
              <span key={f.id} className="chip">{f.name}</span>
            ))}
          </div>
        )}
        <div className="ce-desc small">每一步通常需要 30 秒到 2 分钟。生成完的部分会立刻出现在这里。</div>
      </div>
    )
  return (
    <div className="center-empty">
      <div className="ce-title">从一句话开始</div>
      <div className="ce-desc">在右侧「引导生成」里描述你的软件，AI 会一步步生成功能、页面结构、交互流程和线框。也可以用左上角工具栏手动添加页面。</div>
    </div>
  )
}

function FlowToolbar() {
  const showSelf = useStore((s) => s.showSelf)
  const setShowSelf = useStore((s) => s.setShowSelf)
  const starter = (kind: 'page' | 'overlay', name: string) => {
    const p = useStore.getState().project()
    return starterRoot(p.device, kind, name, p.name)
  }
  const add = (op: Parameters<ReturnType<typeof useStore.getState>['patch']>[0][number], kind: 'screen' | 'cond') => {
    const st = useStore.getState()
    st.patch([op])
    const p = useStore.getState().project()
    st.select({ nodeId: kind === 'screen' ? p.screens.at(-1)?.id : p.conditions.at(-1)?.id })
  }
  return (
    <div className="float-bar">
      <button className="btn ghost sm" onClick={() => add({ op: 'addScreen', screen: { id: '', name: '新页面', states: [{ id: 'default', name: '默认', root: starter('page', '新页面') }] } }, 'screen')}>
        ▯ 页面
      </button>
      <button className="btn ghost sm" onClick={() => add({ op: 'addScreen', screen: { id: '', name: '新弹窗', kind: 'overlay', overlayType: 'modal', states: [{ id: 'default', name: '默认', root: starter('overlay', '新弹窗') }] } }, 'screen')}>
        ◱ 浮层
      </button>
      <button className="btn ghost sm" onClick={() => add({ op: 'addCondition', condition: { id: '', label: '条件？' } }, 'cond')}>
        ◇ 判断
      </button>
      <label className="legend toggle" title="页面内的状态切换、关闭浮层等自连线">
        <input type="checkbox" checked={showSelf} onChange={(e) => setShowSelf(e.target.checked)} />
        页内连线
      </label>
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
        <ErrorBoundary compact name="左侧栏">
          <Sidebar />
        </ErrorBoundary>
        <section className="center">
          <ErrorBoundary compact name={view === 'flow' ? '流程图' : '页面编辑'} key={view}>
            {view === 'flow' ? (
              <>
                <FlowCanvas />
                <FlowToolbar />
                {empty && <EmptyCanvas />}
              </>
            ) : (
              <PageEditor />
            )}
          </ErrorBoundary>
        </section>
        <ErrorBoundary compact name="右侧面板">
          <RightPanel />
        </ErrorBoundary>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
