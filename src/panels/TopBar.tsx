import { useEffect, useRef, useState } from 'react'
import { relayout } from '../flow/autoLayout'
import { exportFlow, exportJson, exportPages, exportSpec } from '../export/exporters'
import type { Project } from '../model/types'
import { DEVICE_KINDS, DEVICES } from '../model/types'
import { useProject, useStore } from '../store'

function Menu({ label, children }: { label: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className="btn ghost" onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && <div className="menu-pop">{children(() => setOpen(false))}</div>}
    </div>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const ai = useStore((s) => s.ai)
  const setAi = useStore((s) => s.setAi)
  const [v, setV] = useState(ai)
  const [test, setTest] = useState<string>('')
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>AI 设置</h3>
        <label className="field">
          <span className="flabel">接口地址（OpenAI 兼容）</span>
          <input value={v.baseUrl} onChange={(e) => setV({ ...v, baseUrl: e.target.value })} />
        </label>
        <div className="insp-hint">默认 /api/llm 由本地开发服务器转发到 .env.local 中配置的网关，密钥不会进入浏览器。</div>
        <label className="field">
          <span className="flabel">API Key（留空使用服务端配置）</span>
          <input type="password" value={v.apiKey} onChange={(e) => setV({ ...v, apiKey: e.target.value })} />
        </label>
        <label className="field">
          <span className="flabel">模型</span>
          <input value={v.model} list="models" onChange={(e) => setV({ ...v, model: e.target.value })} />
          <datalist id="models">
            {['Kiro/claude-sonnet-5.5', 'Kiro/claude-opus-5.5', 'Kiro/claude-haiku-5.5', 'Tao-NewAPI/deepseek-v4-flash', 'Mify-Team/deepseek/deepseek-v4-pro', 'Tao-NewAPI/gpt-5.5'].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        {test && <div className="insp-hint">{test}</div>}
        <div className="modal-actions">
          <button
            className="btn ghost"
            onClick={async () => {
              setTest('测试中…')
              try {
                const r = await fetch(`${v.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(v.apiKey ? { Authorization: `Bearer ${v.apiKey}` } : {}) },
                  body: JSON.stringify({ model: v.model, messages: [{ role: 'user', content: '回复 ok' }], max_tokens: 10 }),
                })
                const t = await r.text()
                setTest(r.ok ? `✓ 连接成功：${JSON.parse(t).choices?.[0]?.message?.content ?? ''}` : `✗ ${r.status} ${t.slice(0, 200)}`)
              } catch (e) {
                setTest(`✗ ${(e as Error).message}`)
              }
            }}
          >
            测试连接
          </button>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button
            className="btn"
            onClick={() => {
              setAi(v)
              onClose()
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const newProject = useStore((s) => s.newProject)
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [device, setDevice] = useState<Project['device']>('mobile')
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>新建项目</h3>
        <label className="field">
          <span className="flabel">项目名称</span>
          <input autoFocus value={name} placeholder="可以留空，AI 会帮你起名" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="flabel">一句话需求</span>
          <textarea rows={4} value={brief} placeholder="例如：面向小区居民的二手物品交换平台，可以发布物品、私信沟通、约定线下交换" onChange={(e) => setBrief(e.target.value)} />
        </label>
        <div className="seg small">
          {DEVICE_KINDS.map((d) => (
            <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>
              {DEVICES[d].name}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button
            className="btn"
            onClick={() => {
              newProject(name.trim() || '未命名项目', brief.trim(), device)
              onClose()
            }}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

export function TopBar() {
  const project = useProject()
  const projects = useStore((s) => s.projects)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const switchProject = useStore((s) => s.switchProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const loadSample = useStore((s) => s.loadSample)
  const importProject = useStore((s) => s.importProject)
  const update = useStore((s) => s.update)
  const showToast = useStore((s) => s.showToast)
  const ai = useStore((s) => s.ai)
  const [dlg, setDlg] = useState<'settings' | 'new' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async (fn: () => unknown) => {
    try {
      await fn()
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`)
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◇</span>
        <span>FlowSketch</span>
      </div>
      <Menu label={<span className="proj-name">{project.name} ▾</span>}>
        {(close) => (
          <>
            <div className="menu-label">项目</div>
            {Object.values(projects)
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((p) => (
                <div key={p.id} className={`menu-item proj ${p.id === project.id ? 'on' : ''}`}>
                  <span onClick={() => (switchProject(p.id), close())}>{p.name}</span>
                  <button className="icon-btn" title="删除项目" onClick={() => confirm(`删除项目「${p.name}」？此操作不可撤销。`) && deleteProject(p.id)}>×</button>
                </div>
              ))}
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => (setDlg('new'), close())}>＋ 新建项目</button>
            <button className="menu-item" onClick={() => (loadSample(), close())}>打开示例项目</button>
            <button
              className="menu-item"
              onClick={() => {
                const n = prompt('重命名项目', project.name)
                if (n) update((p) => ({ ...p, name: n }))
                close()
              }}
            >
              重命名
            </button>
            <button className="menu-item" onClick={() => (fileRef.current?.click(), close())}>导入 JSON…</button>
          </>
        )}
      </Menu>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const p = JSON.parse(await f.text()) as Project
            if (!Array.isArray(p.screens) || !Array.isArray(p.transitions)) throw new Error('不是 FlowSketch 项目文件')
            importProject({ ...p, id: `${p.id ?? 'p'}-${Date.now().toString(36)}`, conditions: p.conditions ?? [], library: p.library ?? [], positions: p.positions ?? {}, chat: p.chat ?? [], features: p.features ?? [], roles: p.roles ?? [], guideStep: p.guideStep ?? 0 })
            showToast('已导入')
          } catch (err) {
            showToast(`导入失败：${(err as Error).message}`)
          }
        }}
      />

      <div className="view-switch seg">
        <button className={view === 'flow' ? 'on' : ''} onClick={() => setView('flow')}>流程总览</button>
        <button className={view === 'page' ? 'on' : ''} onClick={() => setView('page')} disabled={!project.screens.length}>页面编辑</button>
      </div>

      <div className="spacer" />
      <button className="btn ghost" disabled={!canUndo} onClick={undo} title="撤销 (Ctrl+Z)">↶</button>
      <button className="btn ghost" disabled={!canRedo} onClick={redo} title="重做 (Ctrl+Shift+Z)">↷</button>
      {view === 'flow' && (
        <button className="btn ghost" disabled={!project.screens.length} onClick={() => relayout()} title="按流程自动排版">
          自动排版
        </button>
      )}
      <Menu label="导出 ▾">
        {(close) => (
          <>
            <button className="menu-item" onClick={() => (doExport(() => exportFlow(project, 'svg', useStore.getState().showSelf)), close())}>流程图 SVG</button>
            <button className="menu-item" onClick={() => (doExport(() => exportFlow(project, 'png', useStore.getState().showSelf)), close())}>流程图 PNG</button>
            <button className="menu-item" onClick={() => (doExport(() => exportPages(project, 'svg')), close())}>全部页面线框 SVG</button>
            <button className="menu-item" onClick={() => (doExport(() => exportPages(project, 'png')), close())}>全部页面线框 PNG</button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => (exportSpec(project), close())}>交互说明 Markdown</button>
            <button className="menu-item" onClick={() => (exportJson(project), close())}>项目 JSON（可再导入）</button>
          </>
        )}
      </Menu>
      <button className="btn ghost" onClick={() => setDlg('settings')} title={`AI 模型：${ai.model}`}>
        ⚙ {ai.model.split('/').pop()}
      </button>
      {dlg === 'settings' && <SettingsDialog onClose={() => setDlg(null)} />}
      {dlg === 'new' && <NewProjectDialog onClose={() => setDlg(null)} />}
    </header>
  )
}
