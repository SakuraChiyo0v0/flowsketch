import { describe, expect, it } from 'vitest'
import { applyPatch } from './patch'
import { checkProject } from './check'
import { blankProject, sampleProject } from './sample'
import { normalizeElement, walk } from './elements'
import { layoutTree } from '../render/layout'
import { screenSvg } from '../render/paint'

describe('sample project', () => {
  const p = sampleProject()
  it('builds without dangling data', () => {
    expect(p.screens.length).toBe(7)
    expect(p.conditions.length).toBe(3)
    expect(p.transitions.length).toBeGreaterThan(15)
    expect(p.entryId).toBe('home')
  })
  it('has only minor issues', () => {
    const issues = checkProject(p)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    // order status page has no exit on purpose
    expect(issues.some((i) => i.id === 'deadend-order')).toBe(true)
  })
  it('expands library components', () => {
    const cart = p.screens.find((s) => s.id === 'cart')!
    const empty = cart.states.find((s) => s.id === 'empty')!
    const types: string[] = []
    walk(empty.root, (e) => types.push(e.type))
    expect(types).toContain('button')
  })
  it('renders svg for every state', () => {
    for (const s of p.screens) for (const st of s.states) expect(screenSvg(st.root, 375, 812)).toContain('<svg')
  })
})

describe('applyPatch', () => {
  it('skips invalid ops and reports them', () => {
    const r = applyPatch(blankProject(), [
      { op: 'addScreen', screen: { id: 'a', name: 'A' } },
      { op: 'addTransition', transition: { from: 'a', to: 'missing' } },
      { op: 'addScreen', screen: { id: 'a', name: 'A again' } },
    ])
    expect(r.project.screens.map((s) => s.id)).toEqual(['a', 'a-2'])
    expect(r.errors.length).toBe(1)
    expect(r.project.entryId).toBe('a')
  })
  it('removing a screen removes its edges', () => {
    const p = sampleProject()
    const r = applyPatch(p, [{ op: 'removeScreen', id: 'cart' }])
    expect(r.project.transitions.some((t) => t.from === 'cart' || t.to === 'cart')).toBe(false)
  })
  it('deterministic fixes resolve their issue', () => {
    const p = sampleProject()
    const issue = checkProject(p).find((i) => i.id === 'deadend-order')!
    const r = applyPatch(p, issue.fix!.ops)
    expect(checkProject(r.project).some((i) => i.id === 'deadend-order')).toBe(false)
  })
})

describe('normalize + layout', () => {
  it('maps aliases and dedupes ids', () => {
    const el = normalizeElement({ type: 'vstack', children: [{ id: 'x', type: 'heading', label: 'Hi' }, { id: 'x', type: 'weird' }] })
    expect(el.type).toBe('column')
    expect(el.children!.map((c) => c.type)).toEqual(['title', 'text'])
    expect(new Set(el.children!.map((c) => c.id)).size).toBe(2)
  })
  it('spacer pushes footer to bottom', () => {
    const root = normalizeElement({ type: 'column', children: [{ type: 'header', label: 'x' }, { type: 'spacer' }, { id: 'btn', type: 'button', label: 'go' }] })
    const boxes = layoutTree(root, 375, 812)
    const btn = boxes.find((b) => b.el.id === 'btn')!
    expect(btn.y + btn.h).toBeCloseTo(812, 0)
  })
})
