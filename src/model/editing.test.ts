import { describe, expect, it } from 'vitest'
import { applyPatch } from './patch'
import { checkProject } from './check'
import { sampleProject, blankProject } from './sample'
import { normalizeElement, walk } from './elements'
import { layoutTree, measure, textWidth } from '../render/layout'
const textWidthOf = (s: string) => textWidth(s, 14)
import { screenSvg } from '../render/paint'
import { flowsToOps } from '../ai/prompts'
import { autoLayout, nodeHeight, nodeSize } from '../flow/autoLayout'
import type { Project } from './types'

// Scenarios a user goes through when editing by hand.

describe('manual editing', () => {
  it('state ids stay unique when adding states with the same name', () => {
    let p = sampleProject()
    p = applyPatch(p, [
      { op: 'addState', screenId: 'cart', state: { id: '', name: '空' } },
      { op: 'addState', screenId: 'cart', state: { id: '', name: '空' } },
    ]).project
    const ids = p.screens.find((s) => s.id === 'cart')!.states.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('removing a state drops edges that point at it', () => {
    let p = sampleProject()
    const st = p.screens.find((s) => s.id === 'checkout')!.states.find((s) => s.id !== 'default')!
    expect(p.transitions.some((t) => t.toState === st.id || t.fromState === st.id)).toBe(true)
    p = applyPatch(p, [{ op: 'removeState', screenId: 'checkout', stateId: st.id }]).project
    expect(p.transitions.some((t) => (t.to === 'checkout' && t.toState === st.id) || (t.from === 'checkout' && t.fromState === st.id))).toBe(false)
  })

  it('cannot remove the default state', () => {
    const r = applyPatch(sampleProject(), [{ op: 'removeState', screenId: 'cart', stateId: 'default' }])
    expect(r.errors.length).toBe(1)
    expect(r.project.screens.find((s) => s.id === 'cart')!.states.some((s) => s.id === 'default')).toBe(true)
  })

  it('removing a condition removes its branches', () => {
    let p = sampleProject()
    const c = p.conditions[0]
    p = applyPatch(p, [{ op: 'removeCondition', id: c.id }]).project
    expect(p.transitions.some((t) => t.from === c.id || t.to === c.id)).toBe(false)
  })

  it('changing a transition target clears a toState that no longer exists', () => {
    let p = sampleProject()
    const t = p.transitions.find((x) => x.toState)!
    p = applyPatch(p, [{ op: 'updateTransition', id: t.id, changes: { to: 'home' } }]).project
    const t2 = p.transitions.find((x) => x.id === t.id)!
    expect(t2.to).toBe('home')
    const home = p.screens.find((s) => s.id === 'home')!
    if (t2.toState) expect(home.states.some((s) => s.id === t2.toState)).toBe(true)
  })

  it('blank project: first page becomes entry and no errors', () => {
    const p = applyPatch(blankProject(), [{ op: 'addScreen', screen: { id: '', name: '首页' } }]).project
    expect(p.entryId).toBe(p.screens[0].id)
    expect(checkProject(p).filter((i) => i.level === 'error')).toEqual([])
  })
})

describe('desktop rendering', () => {
  const win = normalizeElement({
    type: 'column',
    children: [
      { type: 'titlebar', label: '墨页' },
      { type: 'menubar' },
      { type: 'toolbar' },
      {
        type: 'row',
        props: { grow: true },
        children: [
          { type: 'column', props: { w: 220, pad: 8 }, children: [{ id: 'tree', type: 'tree' }] },
          { type: 'splitter' },
          { type: 'column', props: { grow: true, pad: 16 }, children: [{ type: 'title', label: '标题' }, { type: 'text', lines: 4 }] },
        ],
      },
      { type: 'statusbar' },
    ],
  })

  it('statusbar sits at the bottom and tree fills the sidebar', () => {
    const boxes = layoutTree(win, 1200, 760)
    const sb = boxes.find((b) => b.el.type === 'statusbar')!
    expect(sb.y + sb.h).toBeCloseTo(760, 0)
    const tree = boxes.find((b) => b.el.id === 'tree')!
    expect(tree.h).toBeGreaterThan(500)
    const split = boxes.find((b) => b.el.type === 'splitter')!
    expect(split.w).toBeLessThan(10)
    expect(split.h).toBeGreaterThan(500)
  })

  it('every element type paints without throwing', () => {
    const types = ['select', 'radio', 'slider', 'progress', 'stepper', 'pagination', 'breadcrumb', 'titlebar', 'menubar', 'toolbar', 'tree', 'statusbar', 'splitter']
    const root = normalizeElement({ type: 'column', props: { pad: 16, gap: 8 }, children: types.map((type) => ({ type })) })
    const svg = screenSvg(root, 1200, 760)
    expect(svg).toContain('<svg')
    const seen: string[] = []
    walk(root, (e) => seen.push(e.type))
    for (const t of types) expect(seen).toContain(t)
  })

  it('long text wraps instead of overflowing', () => {
    const el = normalizeElement({ type: 'column', children: [{ type: 'text', label: '这是一段很长的说明文字，用来检查在窄容器里是否会自动换行而不是被截断成一行。' }] })
    expect(measure(el, 160)).toBeGreaterThan(19 * 2)
  })
})

describe('AI output cleanup', () => {
  it('component labels fill placeholder slots in order', () => {
    const lib = sampleProject().library
    const field = lib.find((c) => c.name.includes('表单') || c.template.children?.some((k) => k.type === 'input'))!
    const el = normalizeElement({ type: 'use', component: field.id, labels: ['手机号', '请输入手机号'] }, lib)
    const texts: string[] = []
    walk(el, (n) => n.label && texts.push(n.label))
    expect(texts).toContain('手机号')
    expect(texts).toContain('请输入手机号')
    expect(texts).not.toContain('字段名')
  })

  it('infers back kind from labels', () => {
    const ops = flowsToOps({ transitions: [{ from: 'a', to: 'b', label: '返回首页' }, { from: 'a', to: 'b', label: '提交' }] })
    const kinds = ops.map((o) => (o.op === 'addTransition' ? o.transition.kind : null))
    expect(kinds).toEqual(['back', undefined])
  })
})

describe('auto layout', () => {
  const hub = (): Project => {
    let p = blankProject('hub', '', 'desktop')
    const ops = [{ op: 'addScreen' as const, screen: { id: 'main', name: '主窗口' } }]
    for (let i = 0; i < 9; i++) ops.push({ op: 'addScreen' as const, screen: { id: `d${i}`, name: `弹窗${i}`, kind: 'overlay', overlayType: 'modal', states: [{ id: 'default', name: '默认' }, { id: 'err', name: '失败' }] } as never })
    p = applyPatch(p, ops).project
    p = applyPatch(p, Array.from({ length: 9 }, (_, i) => ({ op: 'addTransition' as const, transition: { from: 'main', to: `d${i}` } }))).project
    return p
  }

  it('hub graphs do not overlap and are not a single tall column', async () => {
    const p = hub()
    const pos = await autoLayout(p)
    const ids = Object.keys(pos)
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = { ...pos[ids[i]], ...nodeSize(p, ids[i]), h: nodeHeight(p, ids[i]) }
        const b = { ...pos[ids[j]], ...nodeSize(p, ids[j]), h: nodeHeight(p, ids[j]) }
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `${ids[i]} overlaps ${ids[j]}`).toBe(false)
      }
    const ys = Object.values(pos).map((v) => v.y)
    const xs = Object.values(pos).map((v) => v.x)
    expect(Math.max(...ys)).toBeLessThan((Math.max(...xs) + 400) * 1.5)
  })
})

describe('web layout', () => {
  it('sidebar | divider | main: divider is 1px and main takes the rest', () => {
    const root = normalizeElement({
      type: 'column',
      children: [
        { type: 'nav', label: '后台' },
        {
          type: 'row',
          props: { grow: true, gap: 0 },
          children: [
            { id: 'side', type: 'column', props: { w: 220 }, children: [{ type: 'listItem', label: 'A' }] },
            { id: 'div', type: 'divider' },
            {
              id: 'main',
              type: 'column',
              props: { grow: true, pad: 20 },
              children: [{ type: 'row', props: { align: 'between' }, children: [{ type: 'title', label: '补货申请' }, { id: 'btns', type: 'row', props: { gap: 8 }, children: [{ type: 'button', label: '导出 Excel' }, { type: 'button', label: '新建申请' }] }] }],
            },
          ],
        },
      ],
    })
    const boxes = layoutTree(root, 1280, 800)
    const get = (id: string) => boxes.find((b) => b.el.id === id)!
    expect(get('div').w).toBe(1)
    expect(get('div').h).toBeGreaterThan(600)
    expect(get('main').w).toBeCloseTo(1280 - 220 - 1, 0)
    // nested button row keeps natural width (two buttons), not half the row
    expect(get('btns').w).toBeLessThan(300)
    const btns = boxes.filter((b) => b.el.type === 'button')
    for (const b of btns) expect(b.w).toBeGreaterThanOrEqual(textWidthOf(b.el.label!) + 32)
  })
})

describe('normalizeElement tolerance', () => {
  it('accepts id/label inside props and props at top level', () => {
    const el = normalizeElement({ type: 'button', variant: 'secondary', props: { id: 'save-btn', label: '保存', size: 'sm' } })
    expect(el.id).toBe('save-btn')
    expect(el.label).toBe('保存')
    expect(el.props).toEqual({ variant: 'secondary', size: 'sm' })
  })
})

describe('layout binding', () => {
  it('binds unbound transitions to elements with matching labels', async () => {
    const { layoutToOps } = await import('../ai/prompts')
    let p = applyPatch(blankProject(), [
      { op: 'addScreen', screen: { id: 'a', name: 'A' } },
      { op: 'addScreen', screen: { id: 'b', name: 'B' } },
      { op: 'addTransition', transition: { from: 'a', to: 'b', label: '下一步' } },
    ]).project
    const ops = layoutToOps({ states: { default: { type: 'column', children: [{ type: 'button', label: '下一步', props: { id: 'next' } }] } } }, 'a', ['default'], p)
    p = applyPatch(p, ops).project
    expect(p.transitions[0].elementId).toBe('next')
  })
})
