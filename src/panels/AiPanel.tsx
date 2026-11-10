import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { chatJson, progressHint } from '../ai/client'
import { chatPrompt, parseChat, STEPS, type StepKey } from '../ai/prompts'
import { beginAi, cancelAi, runAll, runStep } from '../ai/runSteps'
import { checkProject, type Issue } from '../model/check'
import { applyPatch, describeOp } from '../model/patch'
import type { ChatMessage } from '../model/types'
import { DEVICE_KINDS, DEVICES } from '../model/types'
import { useProject, useStore } from '../store'
import { relayout } from '../flow/relayout'

function errMsg(e: unknown) {
  if ((e as Error)?.name === 'AbortError') return '已取消'
  return (e as Error)?.message ?? String(e)
}

function Guide() {
  const project = useProject()
  const busy = useStore((s) => s.busy)
  const showToast = useStore((s) => s.showToast)
  const update = useStore((s) => s.update)
  // local draft while typing; null = show the saved brief
  const [draft, setDraft] = useState<string | null>(null)
  const brief = draft ?? project.brief
  const setBrief = setDraft

  const run = async (fn: () => Promise<string>) => {
    try {
      showToast(await fn())
    } catch (e) {
      showToast(errMsg(e))
    }
  }
  const saveBrief = () => {
    if (draft !== null && draft !== project.brief) update((p) => ({ ...p, brief: draft }))
    setDraft(null)
  }

  return (
    <div className="guide">
      <label className="field">
        <span className="flabel">一句话描述你的软件</span>
        <textarea rows={3} value={brief} placeholder="例如：一个给健身房会员用的约课 App，可以看课表、预约私教、签到、查看训练记录" onChange={(e) => setBrief(e.target.value)} onBlur={saveBrief} />
      </label>
      <div className="seg small">
        {DEVICE_KINDS.map((d) => (
          <button key={d} className={project.device === d ? 'on' : ''} onClick={() => update((p) => ({ ...p, device: d }))}>
            {DEVICES[d].name}
          </button>
        ))}
      </div>
      <div className="steps">
        {STEPS.map((s) => {
          const done = project.guideStep >= s.n
          const next = project.guideStep + 1 === s.n
          const blocked = s.n > 1 && project.guideStep < s.n - 1 && !(s.n === 4 && project.screens.length > 0)
          return (
            <div key={s.key} className={`step ${done ? 'done' : ''} ${next ? 'next' : ''}`}>
              <div className="step-n">{done ? '✓' : s.n}</div>
              <div className="step-main">
                <div className="step-name">{s.name}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
              <button
                className={`btn sm ${next ? '' : 'ghost'}`}
                disabled={!!busy || blocked || (s.n === 1 && !brief.trim())}
                onClick={() => {
                  if (s.key === 'sitemap' && project.screens.length && !confirm('重新生成页面结构会替换现有的全部页面、布局和连线（可撤销）。继续？')) return
                  if (s.key === 'flows' && project.transitions.length && !confirm('重新生成交互流程会替换现有的全部连线和判断（可撤销）。继续？')) return
                  if (s.key === 'layouts' && done && !confirm('重新生成所有页面的布局？手动修改过的布局会被覆盖（可撤销）。')) return
                  saveBrief()
                  run(() => runStep(s.key as StepKey))
                }}
              >
                {done ? '重新生成' : '生成'}
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="btn full"
        disabled={!!busy || !brief.trim()}
        onClick={() => {
          saveBrief()
          run(runAll)
        }}
      >
        ✦ 一键生成剩余步骤
      </button>
      {project.features.length > 0 && (
        <div className="features">
          <div className="insp-sub">功能清单{project.roles.length ? ` · ${project.roles.join('、')}` : ''}</div>
          {project.features.map((f) => (
            <div key={f.id} className="feat">
              <b>{f.name}</b>
              {f.description && <span>{f.description}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="insp-hint">每一步的结果都可以手动修改，再继续下一步；后面的步骤会以你修改后的内容为准。</div>
    </div>
  )
}

function ProposalCard({ m }: { m: ChatMessage }) {
  const project = useProject()
  const update = useStore((s) => s.update)
  const showToast = useStore((s) => s.showToast)
  const p = m.proposal!
  const preview = useMemo(() => (p.status === 'pending' ? applyPatch(project, p.ops) : null), [p, project])
  const setStatus = (status: 'accepted' | 'rejected', errors?: string[]) =>
    update((x) => ({ ...x, chat: x.chat.map((c) => (c.id === m.id ? { ...c, proposal: { ...c.proposal!, status, errors } } : c)) }), false)

  return (
    <div className={`proposal ${p.status}`}>
      <div className="prop-head">
        <span className="prop-tag">修改提议</span>
        <span className="prop-sum">{p.summary}</span>
      </div>
      <ul className="prop-ops">
        {p.ops.slice(0, 12).map((op, i) => (
          <li key={i}>{describeOp(op, project)}</li>
        ))}
        {p.ops.length > 12 && <li>… 共 {p.ops.length} 项</li>}
      </ul>
      {preview && preview.errors.length > 0 && <div className="prop-err">{preview.errors.length} 项无法执行，将被跳过</div>}
      {p.status === 'pending' ? (
        <div className="prop-actions">
          <button
            className="btn sm"
            onClick={async () => {
              const errs = useStore.getState().patch(p.ops)
              setStatus('accepted', errs)
              const before = new Set(Object.keys(useStore.getState().project().positions))
              if (p.ops.some((o) => o.op === 'addScreen' || o.op === 'addCondition') && before.size > 0) {
                // new nodes get positions from the canvas auto-layout; offer full relayout if the graph changed a lot
                if (p.ops.filter((o) => o.op === 'addScreen' || o.op === 'addCondition').length > 2) await relayout()
              }
              showToast(errs.length ? `已应用，${errs.length} 项被跳过` : '已应用')
            }}
          >
            接受
          </button>
          <button className="btn ghost sm" onClick={() => setStatus('rejected')}>拒绝</button>
        </div>
      ) : (
        <div className="prop-status">{p.status === 'accepted' ? `✓ 已接受${p.errors?.length ? `（${p.errors.length} 项跳过）` : ''}` : '已拒绝'}</div>
      )}
    </div>
  )
}

function Chat({ pending, clearPending }: { pending?: string | null; clearPending?: () => void }) {
  const project = useProject()
  const update = useStore((s) => s.update)
  const busy = useStore((s) => s.busy)
  const view = useStore((s) => s.view)
  const screenId = useStore((s) => s.screenId)
  const stateId = useStore((s) => s.stateId)
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [project.chat.length])

  const send = async (msg: string) => {
    if (!msg.trim() || busy) return
    setText('')
    const userMsg: ChatMessage = { id: nanoid(8), role: 'user', text: msg }
    update((p) => ({ ...p, chat: [...p.chat, userMsg] }), false)
    const signal = beginAi('AI 思考中…')
    try {
      const st = useStore.getState()
      const cur = st.project()
      const history = cur.chat.slice(-10).map((c) => ({ role: c.role, content: c.role === 'assistant' ? JSON.stringify({ reply: c.text, summary: c.proposal?.summary ?? '', ops: [] }) : c.text }))
      const scr = cur.screens.find((s) => s.id === screenId)
      const focus = view === 'page' && scr ? `页面「${scr.name}」(id: ${scr.id}) 的状态 ${stateId}` : undefined
      const res = await chatJson(st.ai, chatPrompt(cur, history, focus), parseChat, { signal, maxTokens: 16000, onProgress: (t) => useStore.getState().setBusy(`AI 正在准备修改 · 已收到 ${progressHint(t)}`) })
      const am: ChatMessage = {
        id: nanoid(8),
        role: 'assistant',
        text: res.reply || (res.ops.length ? '我准备了以下修改：' : '（没有修改）'),
        proposal: res.ops.length ? { summary: res.summary || res.reply, ops: res.ops, status: 'pending' } : undefined,
      }
      update((p) => ({ ...p, chat: [...p.chat, am] }), false)
    } catch (e) {
      update((p) => ({ ...p, chat: [...p.chat, { id: nanoid(8), role: 'assistant', text: `⚠ ${errMsg(e)}` }] }), false)
    } finally {
      useStore.getState().setBusy(null)
    }
  }

  // StrictMode runs effects twice in dev; guard so a pending message is sent once
  const sentPending = useRef<string | null>(null)
  useEffect(() => {
    if (pending && sentPending.current !== pending) {
      sentPending.current = pending
      clearPending?.()
      send(pending)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const suggestions = project.screens.length
    ? ['给支付失败加一个取消路径', '加一个个人中心页面，从底部标签进入', '检查流程里还缺哪些异常情况']
    : ['帮我设计一个记账 App 的页面结构']

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {project.chat.length === 0 && <div className="insp-empty">用自然语言修改设计，例如「在购物车和结算之间加一个优惠券页」。AI 会给出修改提议，你确认后才生效。</div>}
        {project.chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="bubble">{m.text}</div>
            {m.proposal && <ProposalCard m={m} />}
          </div>
        ))}
      </div>
      <div className="chat-suggest">
        {suggestions.map((s) => (
          <button key={s} className="chip" disabled={!!busy} onClick={() => send(s)}>{s}</button>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          rows={2}
          value={text}
          placeholder="描述你想怎么改…（Enter 发送，Shift+Enter 换行）"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send(text)
            }
          }}
        />
        <button className="btn" disabled={!!busy || !text.trim()} onClick={() => send(text)}>发送</button>
      </div>
      {project.chat.length > 0 && (
        <button className="link-btn" onClick={() => confirm('清空对话记录？') && update((p) => ({ ...p, chat: [] }), false)}>清空对话</button>
      )}
    </div>
  )
}

function LogicCheck({ onAskAi }: { onAskAi: (text: string) => void }) {
  const project = useProject()
  const patch = useStore((s) => s.patch)
  const select = useStore((s) => s.select)
  const setView = useStore((s) => s.setView)
  const issues = useMemo(() => checkProject(project), [project])
  const counts = { error: 0, warning: 0, info: 0 }
  issues.forEach((i) => counts[i.level]++)
  const icon = { error: '●', warning: '▲', info: '○' }

  if (!project.screens.length) return <div className="insp-empty">还没有页面，无需检查。</div>
  return (
    <div className="check">
      <div className="check-sum">
        {issues.length === 0 ? (
          <span className="ok">✓ 没有发现逻辑问题</span>
        ) : (
          <>
            <span className="lv-error">{counts.error} 错误</span>
            <span className="lv-warning">{counts.warning} 警告</span>
            <span className="lv-info">{counts.info} 提示</span>
          </>
        )}
      </div>
      {issues.map((i: Issue) => (
        <div key={i.id} className={`issue lv-${i.level}`}>
          <div className="issue-head" onClick={() => i.targetId && (setView('flow'), select({ nodeId: i.targetId }))}>
            <span className="lv-icon">{icon[i.level]}</span>
            <span className="issue-title">{i.title}</span>
          </div>
          <div className="issue-detail">{i.detail}</div>
          <div className="issue-actions">
            {i.fix && (
              <button className="btn sm" onClick={() => patch(i.fix!.ops)}>{i.fix.label}</button>
            )}
            {i.aiFix && (
              <button className="btn ghost sm" onClick={() => onAskAi(i.aiFix!)}>让 AI 修复</button>
            )}
          </div>
        </div>
      ))}
      <div className="insp-hint">检查基于流程图结构直接计算：可达性、死路、浮层关闭、判断分支、状态进入与恢复路径。</div>
    </div>
  )
}

function BusyBar({ text }: { text: string }) {
  // restart the timer whenever the phase (text before " · ") changes
  const phase = text.split(' · ')[0]
  const [start, setStart] = useState(() => Date.now())
  const [lastPhase, setLastPhase] = useState(phase)
  if (phase !== lastPhase) {
    setLastPhase(phase)
    setStart(Date.now())
  }
  const [now, setNow] = useState(start)
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(iv)
  }, [])
  const sec = Math.round((now - start) / 1000)
  return (
    <div className="busy">
      <span className="spin" />
      <span>{text}</span>
      <span className="elapsed">{sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`}</span>
      <button className="link-btn" onClick={cancelAi}>取消</button>
    </div>
  )
}

export function AiPanel() {
  const [tab, setTab] = useState<'guide' | 'chat' | 'check'>('guide')
  const project = useProject()
  const busy = useStore((s) => s.busy)
  const issues = useMemo(() => checkProject(project), [project])
  const warn = issues.filter((i) => i.level !== 'info').length
  const [pending, setPending] = useState<string | null>(null)

  // on project switch: unfinished projects open on the guide, finished ones on chat
  const [lastProject, setLastProject] = useState(project.id)
  if (lastProject !== project.id) {
    setLastProject(project.id)
    setTab(project.guideStep < 4 ? 'guide' : 'chat')
  }

  return (
    <div className="ai-panel">
      <div className="panel-head tabs-head">
        <div className="seg">
          <button className={tab === 'guide' ? 'on' : ''} onClick={() => setTab('guide')}>引导生成</button>
          <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>对话修改</button>
          <button className={tab === 'check' ? 'on' : ''} onClick={() => setTab('check')}>
            逻辑检查{warn > 0 && <span className="badge-n">{warn}</span>}
          </button>
        </div>
      </div>
      {busy && <BusyBar text={busy} />}
      <div className="ai-body">
        {tab === 'guide' && <Guide key={project.id} />}
        {tab === 'chat' && <Chat pending={pending} clearPending={() => setPending(null)} />}
        {tab === 'check' && (
          <LogicCheck
            onAskAi={(t) => {
              setPending(t)
              setTab('chat')
            }}
          />
        )}
      </div>
    </div>
  )
}

export { Chat }
