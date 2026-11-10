// Core data model. Every view (flow canvas, page editor, SVG export) and the AI
// read and write this one structure, so human edits and AI edits never diverge.

export type DeviceKind = 'mobile' | 'web' | 'desktop'

export type ElementType =
  | 'column'
  | 'row'
  | 'header'
  | 'title'
  | 'text'
  | 'button'
  | 'input'
  | 'search'
  | 'image'
  | 'card'
  | 'listItem'
  | 'tabbar'
  | 'tabs'
  | 'nav'
  | 'icon'
  | 'avatar'
  | 'badge'
  | 'toggle'
  | 'checkbox'
  | 'divider'
  | 'spacer'
  | 'table'
  | 'chart'
  | 'select'
  | 'radio'
  | 'slider'
  | 'progress'
  | 'stepper'
  | 'pagination'
  | 'breadcrumb'
  | 'titlebar'
  | 'menubar'
  | 'toolbar'
  | 'tree'
  | 'statusbar'
  | 'splitter'

export type PropValue = string | number | boolean

export interface WElement {
  id: string
  type: ElementType
  label?: string
  props?: Record<string, PropValue>
  children?: WElement[]
}

export interface ScreenState {
  id: string
  name: string
  root: WElement
  note?: string
}

export type ScreenKind = 'page' | 'overlay'
export type OverlayType = 'modal' | 'sheet' | 'drawer' | 'toast'

export interface Screen {
  id: string
  name: string
  kind: ScreenKind
  overlayType?: OverlayType
  description?: string
  /** opened from outside the app (menu bar, notification, deep link); counts as an entry point */
  externalEntry?: boolean
  states: ScreenState[]
}

export interface Condition {
  id: string
  label: string
}

export type Trigger = 'tap' | 'submit' | 'swipe' | 'longpress' | 'auto' | 'back' | 'condition'
export type Action = 'navigate' | 'open' | 'close' | 'back' | 'setState'
export type TransitionKind = 'normal' | 'error' | 'back'

export interface Transition {
  id: string
  /** screen id or condition id */
  from: string
  /** state of the source screen; undefined = default state */
  fromState?: string
  /** element in the source state that triggers it */
  elementId?: string
  /** screen id or condition id */
  to: string
  /** state of the target screen; undefined = default state */
  toState?: string
  trigger: Trigger
  action: Action
  label?: string
  kind: TransitionKind
  /** for transitions leaving a condition: "是" / "否" / custom */
  branch?: string
}

export interface Feature {
  id: string
  name: string
  description?: string
}

export interface ComponentDef {
  id: string
  name: string
  description?: string
  template: WElement
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposal?: Proposal
}

export interface Proposal {
  summary: string
  ops: PatchOp[]
  status: 'pending' | 'accepted' | 'rejected'
  errors?: string[]
}

export interface Project {
  id: string
  name: string
  brief: string
  device: DeviceKind
  entryId?: string
  features: Feature[]
  roles: string[]
  screens: Screen[]
  conditions: Condition[]
  transitions: Transition[]
  library: ComponentDef[]
  positions: Record<string, { x: number; y: number }>
  chat: ChatMessage[]
  /** furthest guided-generation step completed (0 = none) */
  guideStep: number
  updatedAt: number
}

// ---- AI / user patch operations -------------------------------------------

export interface ScreenInput {
  id: string
  name: string
  kind?: ScreenKind
  overlayType?: OverlayType
  description?: string
  externalEntry?: boolean
  states?: { id: string; name: string; root?: unknown }[]
}

export type TransitionInput = Omit<Transition, 'id' | 'kind' | 'action' | 'trigger'> & {
  id?: string
  kind?: TransitionKind
  action?: Action
  trigger?: Trigger
}

export type PatchOp =
  | { op: 'addScreen'; screen: ScreenInput }
  | { op: 'updateScreen'; id: string; name?: string; description?: string; kind?: ScreenKind; overlayType?: OverlayType; externalEntry?: boolean }
  | { op: 'removeScreen'; id: string }
  | { op: 'addState'; screenId: string; state: { id: string; name: string; root?: unknown } }
  | { op: 'removeState'; screenId: string; stateId: string }
  | { op: 'setLayout'; screenId: string; stateId: string; root: unknown }
  | { op: 'addTransition'; transition: TransitionInput }
  | { op: 'updateTransition'; id: string; changes: Partial<TransitionInput> }
  | { op: 'removeTransition'; id: string }
  | { op: 'addCondition'; condition: Condition }
  | { op: 'updateCondition'; id: string; label: string }
  | { op: 'removeCondition'; id: string }
  | { op: 'setEntry'; id: string }
  | { op: 'setFeatures'; features: { name: string; description?: string }[]; roles?: string[] }
  | { op: 'renameProject'; name: string }

export interface DeviceMeta {
  name: string
  short: string
  w: number
  h: number
  /** how the AI should think about this surface */
  hint: string
  modalW: number
  drawerW: number
}

export const DEVICES: Record<DeviceKind, DeviceMeta> = {
  mobile: { name: '移动 App', short: '手机', w: 375, h: 812, hint: '手机页面 375×812', modalW: 320, drawerW: 300 },
  web: { name: 'Web 应用', short: 'Web', w: 1280, h: 800, hint: 'Web 页面 1280×800', modalW: 480, drawerW: 360 },
  desktop: { name: '桌面应用', short: '桌面', w: 1200, h: 760, hint: '桌面应用窗口 1200×760（Windows/macOS 原生应用）', modalW: 440, drawerW: 320 },
}

export const DEVICE_KINDS = Object.keys(DEVICES) as DeviceKind[]

export const DEVICE_SIZE: Record<DeviceKind, { w: number; h: number }> = {
  mobile: DEVICES.mobile,
  web: DEVICES.web,
  desktop: DEVICES.desktop,
}

export const DEFAULT_STATE = 'default'
