import { findElement } from './elements'
import type { PatchOp, Project } from './types'
import { DEFAULT_STATE } from './types'

export type IssueLevel = 'error' | 'warning' | 'info'

export interface Issue {
  id: string
  level: IssueLevel
  title: string
  detail: string
  targetId?: string
  /** deterministic fix, when one exists */
  fix?: { label: string; ops: PatchOp[] }
  /** ask AI to fix with this instruction */
  aiFix?: string
}

/** Structural checks over the flow graph. Pure function, no AI. */
export function checkProject(p: Project): Issue[] {
  const issues: Issue[] = []
  const screenIds = new Set(p.screens.map((s) => s.id))
  const allIds = new Set([...screenIds, ...p.conditions.map((c) => c.id)])
  const name = (id: string) => p.screens.find((s) => s.id === id)?.name ?? p.conditions.find((c) => c.id === id)?.label ?? id

  if (p.screens.length === 0) return issues

  const entry = p.entryId && screenIds.has(p.entryId) ? p.entryId : undefined
  if (!entry) {
    const first = p.screens.find((s) => s.kind === 'page')
    issues.push({
      id: 'no-entry',
      level: 'error',
      title: '没有设置入口页',
      detail: '用户打开应用时看到哪个页面不明确。',
      fix: first ? { label: `设为「${first.name}」`, ops: [{ op: 'setEntry', id: first.id }] } : undefined,
    })
  }

  // dangling edges
  for (const t of p.transitions) {
    if (!allIds.has(t.from) || !allIds.has(t.to)) {
      issues.push({
        id: `dangling-${t.id}`,
        level: 'error',
        title: '连线指向不存在的节点',
        detail: `${name(t.from)} → ${name(t.to)}`,
        fix: { label: '删除连线', ops: [{ op: 'removeTransition', id: t.id }] },
      })
    }
  }

  const out = new Map<string, number>()
  const inc = new Map<string, number>()
  for (const t of p.transitions) {
    out.set(t.from, (out.get(t.from) ?? 0) + 1)
    inc.set(t.to, (inc.get(t.to) ?? 0) + 1)
  }

  // reachability from entry (overlays reachable via open; conditions pass through)
  if (entry) {
    // external entries (menu bar, notifications, deep links) start their own paths
    const starts = [entry, ...p.screens.filter((s) => s.externalEntry).map((s) => s.id)]
    const seen = new Set<string>(starts)
    const stack = [...starts]
    while (stack.length) {
      const cur = stack.pop()!
      for (const t of p.transitions) {
        if (t.from === cur && !seen.has(t.to)) {
          seen.add(t.to)
          stack.push(t.to)
        }
      }
    }
    for (const s of p.screens) {
      // screens opened from outside the app (menu bar, notification, deep link) are entry points too
      if (!seen.has(s.id) && !s.externalEntry) {
        issues.push({
          id: `unreachable-${s.id}`,
          level: 'warning',
          title: `「${s.name}」无法到达`,
          detail: '从入口页出发，没有任何路径能走到这个页面。',
          targetId: s.id,
          aiFix: `「${s.name}」(id: ${s.id}) 从入口页无法到达，请补充合理的入口连线。`,
          fix: { label: '它是外部入口', ops: [{ op: 'updateScreen', id: s.id, externalEntry: true }] },
        })
      }
    }
  }

  for (const s of p.screens) {
    const o = out.get(s.id) ?? 0
    if (s.kind === 'overlay') {
      const closes = p.transitions.some((t) => t.from === s.id)
      // toasts dismiss themselves; only flag modals/sheets/drawers
      if (!closes && s.overlayType !== 'toast') {
        issues.push({
          id: `overlay-noclose-${s.id}`,
          level: 'warning',
          title: `浮层「${s.name}」没有关闭方式`,
          detail: '弹窗/抽屉打开后用户无法关闭或离开。',
          targetId: s.id,
          fix: {
            label: '添加「关闭」',
            ops: [{ op: 'addTransition', transition: { from: s.id, to: s.id, action: 'close', trigger: 'tap', label: '关闭', kind: 'back' } }],
          },
        })
      }
      continue
    }
    if (o === 0 && s.id !== entry) {
      issues.push({
        id: `deadend-${s.id}`,
        level: 'warning',
        title: `「${s.name}」没有出口`,
        detail: '进入这个页面后无法返回或继续，用户会卡住。',
        targetId: s.id,
        fix: entry
          ? { label: '添加「返回首页」', ops: [{ op: 'addTransition', transition: { from: s.id, to: entry, label: '返回首页', kind: 'back', action: 'navigate' } }] }
          : undefined,
        aiFix: `「${s.name}」(id: ${s.id}) 没有出口，请补充返回或继续的连线。`,
      })
    }
    // states defined but never entered (one grouped hint per screen)
    const orphans = s.states.filter(
      (st) => st.id !== DEFAULT_STATE && !p.transitions.some((t) => t.to === s.id && t.toState === st.id),
    )
    if (orphans.length) {
      issues.push({
        id: `state-orphan-${s.id}`,
        level: 'info',
        title: `「${s.name}」有 ${orphans.length} 个状态没有进入条件`,
        detail: `${orphans.map((o) => o.name).join('、')}：流程里没有说明什么情况下会出现。`,
        targetId: s.id,
        aiFix: `「${s.name}」(id: ${s.id}) 的状态 ${orphans.map((o) => `「${o.name}」(stateId: ${o.id})`).join('、')} 没有进入它们的连线，请补充触发条件（同页切换用 setState，或通过判断节点）。`,
      })
    }
    for (const st of s.states) {
      if (st.id === DEFAULT_STATE) continue
      // error states should have a way out
      const leaves = p.transitions.some((t) => t.from === s.id && t.fromState === st.id)
      if (/失败|错误|error|fail/i.test(st.name + st.id) && !leaves) {
        issues.push({
          id: `state-noexit-${s.id}-${st.id}`,
          level: 'warning',
          title: `「${s.name} · ${st.name}」没有恢复路径`,
          detail: '出错后用户只能停在这里，应提供重试或取消。',
          targetId: s.id,
          fix: {
            label: '添加「重试」',
            ops: [{ op: 'addTransition', transition: { from: s.id, fromState: st.id, to: s.id, label: '重试', action: 'setState', toState: DEFAULT_STATE, kind: 'back' } }],
          },
        })
      }
    }
    // element references
    for (const t of p.transitions) {
      if (t.from !== s.id || !t.elementId) continue
      const state = s.states.find((x) => x.id === (t.fromState ?? DEFAULT_STATE))
      if (state && !findElement(state.root, t.elementId)) {
        issues.push({
          id: `elref-${t.id}`,
          level: 'info',
          title: '连线绑定的元素已不存在',
          detail: `${s.name} → ${name(t.to)}${t.label ? `「${t.label}」` : ''}`,
          targetId: s.id,
          fix: { label: '解除绑定', ops: [{ op: 'updateTransition', id: t.id, changes: { elementId: undefined } }] },
        })
      }
    }
  }

  for (const c of p.conditions) {
    const outs = p.transitions.filter((t) => t.from === c.id)
    if ((inc.get(c.id) ?? 0) === 0) {
      issues.push({
        id: `cond-noin-${c.id}`,
        level: 'warning',
        title: `判断「${c.label}」没有输入`,
        detail: '没有任何流程会走到这个判断。',
        targetId: c.id,
        fix: { label: '删除判断', ops: [{ op: 'removeCondition', id: c.id }] },
      })
    }
    if (outs.length < 2) {
      issues.push({
        id: `cond-branches-${c.id}`,
        level: 'warning',
        title: `判断「${c.label}」只有 ${outs.length} 个分支`,
        detail: '判断节点至少需要「是」和「否」两条出路。',
        targetId: c.id,
        aiFix: `判断节点「${c.label}」(id: ${c.id}) 的分支不完整，请补齐「是/否」两条出路。`,
      })
    }
  }

  issues.push(...completenessIssues(p))
  return issues
}

// ---- completeness: gaps that are easy to miss when designing ------------------------
//
// These are heuristics over names and descriptions, so they are hints (info/warning)
// with an AI fix, never auto-fixes. They target the gaps that showed up when building
// prototypes from designs: async flows with no outcome, one-sided interactions, and
// permission-dependent features with no permission handling.

const WAIT = /等待|待确认|审核中|处理中|发送中|上传中|支付中|提交中|呼叫中|连接中|匹配中|排队|pending|waiting|processing/i
const SUCCESS = /成功|已完成|完成|已绑定|已确认|已通过|已接通|已支付|已发送|done|success|connected|confirmed|paid/i
const FAILURE = /失败|错误|超时|拒绝|过期|无效|未接通|取消|error|fail|timeout|reject|expired/i

/** Features that need OS permissions, and the words that show the design handles them. */
const PERMISSIONS: { need: RegExp; perm: string }[] = [
  { need: /定位|位置|地图|附近|导航|轨迹/, perm: '定位' },
  { need: /语音|录音|通话|呼叫|麦克风|说话/, perm: '麦克风' },
  { need: /拍照|扫码|二维码|相机|视频通话|人脸/, perm: '相机' },
  { need: /步数|运动|健康|心率|睡眠/, perm: '运动与健康' },
  { need: /提醒|通知|推送|消息提醒/, perm: '通知' },
  { need: /相册|上传图片|选择照片/, perm: '相册' },
]
const PERM_HANDLED = /权限|授权|允许|开启|去设置|未开启|已关闭/

/**
 * One side starts something the other side should receive. `receive` must match a
 * *screen or state name* (not just a button label), since a receiving side needs a place
 * to show it; words like "对方接听" on the caller's own screen don't count.
 */
const SENDS: { act: RegExp; receive: RegExp; what: string }[] = [
  { act: /呼叫|打电话|视频通话/, receive: /来电|被叫|通话记录|未接来电/, what: '来电/未接来电' },
  { act: /留言|发消息|发送消息|私信/, receive: /新消息|未读|消息列表|留言列表|语音留言|收件|聊天/, what: '收到的消息' },
  { act: /邀请|绑定请求|好友申请|申请加入/, receive: /确认绑定|收到邀请|绑定请求|申请列表|好友请求/, what: '收到的邀请/请求' },
  { act: /提醒子女|提醒家属|通知家属|推送|告警|报警|无活动/, receive: /通知|推送|告警|提醒列表|消息中心|警报/, what: '收到的提醒/通知' },
]

function completenessIssues(p: Project): Issue[] {
  const out: Issue[] = []
  const screenText = (s: Project['screens'][number]) => [s.name, s.description ?? '', ...s.states.map((st) => st.name)].join(' ')
  const allText = [p.brief, ...p.features.map((f) => `${f.name} ${f.description ?? ''}`), ...p.screens.map(screenText), ...p.transitions.map((t) => t.label ?? '')].join(' ')
  const designText = [...p.screens.map(screenText), ...p.transitions.map((t) => `${t.label ?? ''} ${t.branch ?? ''}`)].join(' ')

  // 1. async / waiting states must lead to an outcome (success and failure)
  for (const s of p.screens) {
    for (const st of s.states) {
      if (!WAIT.test(st.name + ' ' + st.id)) continue
      const outs = p.transitions.filter((t) => t.from === s.id && (t.fromState ?? DEFAULT_STATE) === st.id)
      // where outcomes can be expressed: target screen/state names, labels, branches, and condition branches
      const outcomeText = outs
        .flatMap((t) => {
          const toScr = p.screens.find((x) => x.id === t.to)
          const toSt = toScr?.states.find((x) => x.id === t.toState)
          const cond = p.conditions.find((c) => c.id === t.to)
          const condBranches = cond ? p.transitions.filter((x) => x.from === cond.id).map((x) => `${x.branch ?? ''} ${p.screens.find((y) => y.id === x.to)?.name ?? ''}`) : []
          return [t.label ?? '', t.branch ?? '', toSt?.name ?? '', toScr && toScr.id !== s.id ? toScr.name : '', cond?.label ?? '', ...condBranches]
        })
        .join(' ')
      // a wait that leaves to another screen (other than by cancel/back) counts as an outcome
      const forward = outs.some((t) => t.to !== s.id && t.kind !== 'back' && !/取消|返回|关闭/.test(t.label ?? ''))
      const hasSuccess = SUCCESS.test(outcomeText) || forward
      const hasFailure = FAILURE.test(outcomeText.replace(/取消/g, ''))
      if (hasSuccess && hasFailure) continue
      const missing = [!hasSuccess && '成功', !hasFailure && '失败/超时'].filter(Boolean).join('和')
      out.push({
        id: `wait-outcome-${s.id}-${st.id}`,
        level: 'warning',
        title: `「${s.name} · ${st.name}」缺少${missing}的结局`,
        detail: `这是一个等待状态，流程里没有说明${missing}之后会怎样。用户会一直停在等待里。`,
        targetId: s.id,
        aiFix: `「${s.name}」(id: ${s.id}) 的等待状态「${st.name}」(stateId: ${st.id}) 缺少${missing}后的去向。请补上：${!hasSuccess ? '成功后进入的页面或状态；' : ''}${!hasFailure ? '失败或超时后的状态，以及从那里重试或返回的连线；' : ''}必要时新增状态。`,
      })
    }
  }

  // 2. one side starts something; the other side needs a place to receive it
  //    (receiving places are screen and state names; overlays named "来电" etc. count)
  const placeText = p.screens.map((s) => [s.name, ...s.states.map((st) => st.name)].join(' ')).join(' ')
  if (p.roles.length >= 2 || /子女|父母|买家|卖家|司机|乘客|老师|学生|医生|患者|商家|用户端|管理端/.test(p.brief)) {
    for (const r of SENDS) {
      if (!r.act.test(allText)) continue
      if (r.receive.test(placeText)) continue
      out.push({
        id: `receive-${r.what}`,
        level: 'warning',
        title: `另一端缺少「${r.what}」`,
        detail: `设计里有一方会发起（${allText.match(r.act)?.[0]}），但没有接收方看到它的页面或状态。`,
        aiFix: `设计里有一方会「${allText.match(r.act)?.[0]}」，但另一方没有接收的界面。请补上接收方看到${r.what}的页面、浮层或状态，以及从那里继续操作的连线。`,
      })
    }
  }

  // 3. features that depend on OS permissions need permission handling somewhere
  if (p.device !== 'web') {
    const needed = PERMISSIONS.filter((x) => x.need.test(allText)).map((x) => x.perm)
    if (needed.length && !PERM_HANDLED.test(designText)) {
      out.push({
        id: 'permissions',
        level: 'info',
        title: `没有权限引导（${needed.join('、')}）`,
        detail: '这些功能依赖系统权限，设计里没有首次授权引导，也没有被拒绝后的状态。',
        aiFix: `产品用到了 ${needed.join('、')} 权限，但设计里没有权限处理。请为用到这些权限的页面补上「未授权」状态（说明原因并提供「去开启」），并在首次使用时加授权引导。`,
      })
    }
  }

  // 4. shared sample data keeps generated pages consistent
  if (p.screens.length >= 4 && !p.sampleData?.trim()) {
    out.push({
      id: 'no-sample-data',
      level: 'info',
      title: '没有共享示例数据',
      detail: '各页面会各自编造人名和数据，生成的线框和成品前后对不上。',
      aiFix: '为这个产品写一份共享示例数据（setSampleData）：贯穿各页面的人物（姓名、称呼、关系）、地点和核心业务数据，每行一条「名称：内容」，8-15 行。',
    })
  }

  return out
}
