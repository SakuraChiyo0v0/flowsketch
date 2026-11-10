import { create } from 'zustand'
import { applyPatch } from './model/patch'
import { blankProject, sampleProject } from './model/sample'
import type { PatchOp, Project } from './model/types'
import { DEFAULT_STATE } from './model/types'

const KEY = 'flowsketch.projects.v1'
const CUR = 'flowsketch.current.v1'
const AI_KEY = 'flowsketch.ai.v1'

export type View = 'flow' | 'page'

export interface Selection {
  /** node in flow view */
  nodeId?: string
  edgeId?: string
  /** element in page view */
  elementId?: string
}

export interface AiSettings {
  baseUrl: string
  apiKey: string
  model: string
}

interface State {
  projects: Record<string, Project>
  currentId: string
  view: View
  screenId?: string
  stateId: string
  sel: Selection
  past: Project[]
  future: Project[]
  ai: AiSettings
  busy: string | null
  toast: string | null
  /** show same-screen transitions (state switches, closes) on the flow canvas */
  showSelf: boolean
  setShowSelf: (v: boolean) => void

  project: () => Project
  /** apply ops as one undoable step; returns errors */
  patch: (ops: PatchOp[]) => string[]
  /** replace project via a function (one undoable step) */
  update: (fn: (p: Project) => Project, undoable?: boolean) => void
  undo: () => void
  redo: () => void
  openScreen: (id: string, stateId?: string) => void
  setView: (v: View) => void
  select: (s: Selection) => void
  newProject: (name: string, brief: string, device: Project['device']) => void
  loadSample: () => void
  switchProject: (id: string) => void
  deleteProject: (id: string) => void
  importProject: (p: Project) => void
  setAi: (a: Partial<AiSettings>) => void
  setBusy: (b: string | null) => void
  showToast: (t: string) => void
}

function loadProjects(): Record<string, Project> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, Project>
      if (Object.keys(obj).length) return obj
    }
  } catch {
    /* ignore corrupt storage */
  }
  const s = sampleProject()
  return { [s.id]: s }
}

function loadAi(): AiSettings {
  const env = import.meta.env
  const d: AiSettings = {
    baseUrl: '/api/llm',
    apiKey: '',
    model: (env.VITE_LLM_MODEL as string) || 'Kiro/claude-sonnet-5.5',
  }
  try {
    const raw = localStorage.getItem(AI_KEY)
    if (raw) return { ...d, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return d
}

const initial = loadProjects()
const savedCur = localStorage.getItem(CUR)
const initialId = savedCur && initial[savedCur] ? savedCur : Object.values(initial).sort((a, b) => b.updatedAt - a.updatedAt)[0].id

let saveTimer: number | undefined
function persist(projects: Record<string, Project>, cur: string) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(projects))
      localStorage.setItem(CUR, cur)
    } catch (e) {
      console.error('save failed', e)
    }
  }, 300)
}

const HISTORY = 80

export const useStore = create<State>((set, get) => ({
  projects: initial,
  currentId: initialId,
  view: 'flow',
  screenId: undefined,
  stateId: DEFAULT_STATE,
  sel: {},
  past: [],
  future: [],
  ai: loadAi(),
  busy: null,
  toast: null,
  showSelf: localStorage.getItem('flowsketch.showSelf') === '1',
  setShowSelf: (v) => {
    localStorage.setItem('flowsketch.showSelf', v ? '1' : '0')
    set({ showSelf: v })
  },

  project: () => get().projects[get().currentId],

  update: (fn, undoable = true) => {
    const { projects, currentId, past } = get()
    const cur = projects[currentId]
    const next = { ...fn(cur), updatedAt: Date.now() }
    const nextProjects = { ...projects, [currentId]: next }
    set({
      projects: nextProjects,
      ...(undoable ? { past: [...past.slice(-HISTORY), cur], future: [] } : {}),
    })
    persist(nextProjects, currentId)
    // keep page view pointing at something that exists
    const { screenId, stateId } = get()
    if (screenId) {
      const scr = next.screens.find((s) => s.id === screenId)
      if (!scr) set({ screenId: undefined, view: 'flow', sel: {} })
      else if (!scr.states.some((s) => s.id === stateId)) set({ stateId: DEFAULT_STATE })
    }
  },

  patch: (ops) => {
    let errors: string[] = []
    get().update((p) => {
      const r = applyPatch(p, ops)
      errors = r.errors
      return r.project
    })
    return errors
  },

  undo: () => {
    const { past, future, projects, currentId } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    const nextProjects = { ...projects, [currentId]: prev }
    set({ projects: nextProjects, past: past.slice(0, -1), future: [projects[currentId], ...future] })
    persist(nextProjects, currentId)
    get().update((p) => p, false)
  },

  redo: () => {
    const { past, future, projects, currentId } = get()
    if (!future.length) return
    const nxt = future[0]
    const nextProjects = { ...projects, [currentId]: nxt }
    set({ projects: nextProjects, past: [...past, projects[currentId]], future: future.slice(1) })
    persist(nextProjects, currentId)
    get().update((p) => p, false)
  },

  openScreen: (id, stateId = DEFAULT_STATE) => set({ view: 'page', screenId: id, stateId, sel: {} }),
  setView: (v) => {
    if (v === 'page' && !get().screenId) {
      const first = get().project().screens[0]
      if (!first) return
      set({ view: 'page', screenId: first.id, stateId: DEFAULT_STATE, sel: {} })
      return
    }
    set({ view: v, sel: {} })
  },
  select: (s) => set({ sel: s }),

  newProject: (name, brief, device) => {
    const p = blankProject(name, brief, device)
    const projects = { ...get().projects, [p.id]: p }
    set({ projects, currentId: p.id, past: [], future: [], view: 'flow', screenId: undefined, sel: {} })
    persist(projects, p.id)
  },
  loadSample: () => {
    const p = sampleProject()
    const projects = { ...get().projects, [p.id]: p }
    set({ projects, currentId: p.id, past: [], future: [], view: 'flow', screenId: undefined, sel: {} })
    persist(projects, p.id)
  },
  switchProject: (id) => {
    if (!get().projects[id]) return
    set({ currentId: id, past: [], future: [], view: 'flow', screenId: undefined, sel: {} })
    persist(get().projects, id)
  },
  deleteProject: (id) => {
    const projects = { ...get().projects }
    delete projects[id]
    if (!Object.keys(projects).length) {
      const s = sampleProject()
      projects[s.id] = s
    }
    const cur = get().currentId === id ? Object.keys(projects)[0] : get().currentId
    set({ projects, currentId: cur, past: [], future: [], view: 'flow', screenId: undefined, sel: {} })
    persist(projects, cur)
  },
  importProject: (p) => {
    const projects = { ...get().projects, [p.id]: p }
    set({ projects, currentId: p.id, past: [], future: [], view: 'flow', screenId: undefined, sel: {} })
    persist(projects, p.id)
  },

  setAi: (a) => {
    const ai = { ...get().ai, ...a }
    set({ ai })
    localStorage.setItem(AI_KEY, JSON.stringify(ai))
  },
  setBusy: (b) => set({ busy: b }),
  showToast: (t) => {
    set({ toast: t })
    window.setTimeout(() => get().toast === t && set({ toast: null }), 3500)
  },
}))

export function useProject() {
  return useStore((s) => s.projects[s.currentId])
}
