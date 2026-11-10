import { nanoid } from 'nanoid'
import { applyPatch } from './patch'
import type { ComponentDef, PatchOp, Project } from './types'

export function defaultLibrary(): ComponentDef[] {
  return [
    {
      id: 'product-card',
      name: '商品卡片',
      description: '图片 + 名称 + 价格 + 加购按钮',
      template: {
        id: 'tpl1',
        type: 'card',
        props: { pad: 10, gap: 6 },
        children: [
          { id: 'tpl1a', type: 'image', props: { h: 100 } },
          { id: 'tpl1b', type: 'text', label: '商品名称' },
          {
            id: 'tpl1c',
            type: 'row',
            props: { align: 'between' },
            children: [
              { id: 'tpl1d', type: 'title', label: '¥ 29', props: { size: 'sm' } },
              { id: 'tpl1e', type: 'icon', label: 'plus' },
            ],
          },
        ],
      },
    },
    {
      id: 'empty-block',
      name: '空状态',
      description: '图标 + 说明 + 按钮，用于列表为空',
      template: {
        id: 'tpl2',
        type: 'column',
        props: { gap: 12, pad: 32 },
        children: [
          { id: 'tpl2a', type: 'row', props: { align: 'center' }, children: [{ id: 'tpl2b', type: 'icon', label: 'file', props: { size: 48 } }] },
          { id: 'tpl2c', type: 'text', label: '这里还没有内容' },
          { id: 'tpl2d', type: 'button', label: '去看看', props: { variant: 'secondary' } },
        ],
      },
    },
    {
      id: 'form-field',
      name: '表单项',
      description: '字段名 + 输入框',
      template: {
        id: 'tpl3',
        type: 'column',
        props: { gap: 6 },
        children: [
          { id: 'tpl3a', type: 'text', label: '字段名' },
          { id: 'tpl3b', type: 'input', label: '请输入' },
        ],
      },
    },
  ]
}

export function blankProject(name = '未命名项目', brief = '', device: Project['device'] = 'mobile'): Project {
  return {
    id: nanoid(10),
    name,
    brief,
    device,
    features: [],
    roles: [],
    screens: [],
    conditions: [],
    transitions: [],
    library: defaultLibrary(),
    positions: {},
    chat: [],
    guideStep: 0,
    updatedAt: Date.now(),
  }
}

const header = (label: string, back = true, action?: string) => ({ type: 'header', label, props: { back, ...(action ? { action } : {}) } })
const tabbar = (active: number) => ({ type: 'tabbar', props: { items: '首页,订单,我的', active } })

/** A small food delivery demo with branches, states and overlays. */
export function sampleProject(): Project {
  const p = blankProject('外卖点餐 App', '一个外卖点餐 App：浏览餐厅、点菜加购、下单支付、查看订单状态。', 'mobile')
  const ops: PatchOp[] = [
    {
      op: 'setFeatures',
      roles: ['顾客'],
      features: [
        { name: '浏览餐厅', description: '首页推荐与搜索' },
        { name: '点餐加购', description: '餐厅详情中选择菜品加入购物车' },
        { name: '下单支付', description: '确认地址与支付方式，处理支付失败' },
        { name: '订单追踪', description: '查看订单进度' },
        { name: '账号登录', description: '下单前需要登录' },
      ],
    },
    {
      op: 'addScreen',
      screen: {
        id: 'home',
        name: '首页',
        states: [
          {
            id: 'default',
            name: '默认',
            root: {
              type: 'column',
              children: [
                { type: 'row', props: { pad: 12, gap: 8 }, children: [{ type: 'icon', label: 'location' }, { type: 'title', label: '送至 望京 SOHO', props: { size: 'sm' } }, { type: 'spacer' }, { type: 'icon', label: 'bell' }] },
                { type: 'column', props: { pad: 12, gap: 12 }, children: [{ id: 'home-search', type: 'search', label: '搜索餐厅、菜品' }, { type: 'image', props: { h: 120 }, label: 'Banner' }, { type: 'title', label: '附近餐厅', props: { size: 'sm' } }] },
                {
                  type: 'column',
                  props: { grow: true, gap: 0 },
                  children: [
                    { id: 'home-r1', type: 'listItem', label: '绿碗轻食', props: { sub: '4.8 分 · 30 分钟 · 起送 ¥20' } },
                    { type: 'listItem', label: '老王拉面', props: { sub: '4.6 分 · 25 分钟 · 起送 ¥15' } },
                    { type: 'listItem', label: '川味小馆', props: { sub: '4.7 分 · 35 分钟 · 起送 ¥25' } },
                  ],
                },
                tabbar(0),
              ],
            },
          },
          { id: 'loading', name: '加载中', root: { type: 'column', children: [{ type: 'column', props: { pad: 16, gap: 14, grow: true }, children: [{ type: 'search', label: '搜索餐厅、菜品' }, { type: 'image', props: { h: 120 } }, { type: 'text', props: { lines: 3 } }, { type: 'text', props: { lines: 3 } }] }, tabbar(0)] } },
        ],
      },
    },
    {
      op: 'addScreen',
      screen: {
        id: 'restaurant',
        name: '餐厅详情',
        states: [
          {
            id: 'default',
            name: '默认',
            root: {
              type: 'column',
              children: [
                header('绿碗轻食', true, 'heart'),
                { type: 'image', props: { h: 140 } },
                { type: 'column', props: { pad: 12, gap: 6 }, children: [{ type: 'title', label: '绿碗轻食' }, { type: 'text', label: '4.8 分 · 健康轻食 · 25-35 分钟' }] },
                { type: 'tabs', props: { items: '菜单,评价,商家', active: 0 } },
                {
                  type: 'column',
                  props: { grow: true, gap: 0 },
                  children: [
                    { id: 'rest-add', type: 'listItem', label: '凯撒沙拉', props: { sub: '¥ 32', chevron: false, trailing: '+' } },
                    { type: 'listItem', label: '香煎鸡胸饭', props: { sub: '¥ 38', chevron: false, trailing: '+' } },
                    { type: 'listItem', label: '照烧三文鱼', props: { sub: '¥ 52', chevron: false, trailing: '+' } },
                  ],
                },
                { type: 'row', props: { pad: 12, gap: 12 }, children: [{ id: 'rest-cart', type: 'button', label: '购物车 (2)', props: { variant: 'secondary', grow: true } }, { id: 'rest-checkout', type: 'button', label: '去结算', props: { grow: true } }] },
              ],
            },
          },
        ],
      },
    },
    {
      op: 'addScreen',
      screen: {
        id: 'cart',
        name: '购物车',
        states: [
          {
            id: 'default',
            name: '默认',
            root: {
              type: 'column',
              children: [
                header('购物车'),
                { type: 'column', props: { gap: 0 }, children: [{ type: 'listItem', label: '凯撒沙拉', props: { sub: '¥ 32', trailing: '× 1', chevron: false } }, { type: 'listItem', label: '香煎鸡胸饭', props: { sub: '¥ 38', trailing: '× 1', chevron: false } }] },
                { type: 'column', props: { pad: 12, gap: 8 }, children: [{ id: 'cart-coupon', type: 'listItem', label: '优惠券', props: { thumb: false, trailing: '2 张可用' } }, { type: 'row', props: { align: 'between' }, children: [{ type: 'text', label: '合计' }, { type: 'title', label: '¥ 70', props: { size: 'sm' } }] }] },
                { type: 'spacer' },
                { type: 'column', props: { pad: 12 }, children: [{ id: 'cart-checkout', type: 'button', label: '去结算' }] },
              ],
            },
          },
          { id: 'empty', name: '空', root: { type: 'column', children: [header('购物车'), { type: 'spacer' }, { type: 'use', component: 'empty-block', label: '购物车是空的' }, { type: 'spacer' }] } },
        ],
      },
    },
    {
      op: 'addScreen',
      screen: {
        id: 'checkout',
        name: '确认订单',
        states: [
          {
            id: 'default',
            name: '默认',
            root: {
              type: 'column',
              children: [
                header('确认订单'),
                { type: 'column', props: { pad: 12, gap: 10 }, children: [{ type: 'card', children: [{ type: 'title', label: '送餐地址', props: { size: 'sm' } }, { type: 'text', label: '望京 SOHO T1 · 张三 138****0000' }] }, { type: 'card', children: [{ type: 'title', label: '支付方式', props: { size: 'sm' } }, { type: 'checkbox', label: '微信支付', props: { checked: true } }, { type: 'checkbox', label: '支付宝' }] }] },
                { type: 'spacer' },
                { type: 'row', props: { pad: 12, gap: 12 }, children: [{ type: 'title', label: '¥ 70', props: { size: 'sm' } }, { id: 'checkout-pay', type: 'button', label: '提交订单', props: { grow: true } }] },
              ],
            },
          },
          {
            id: 'failed',
            name: '支付失败',
            root: {
              type: 'column',
              children: [
                header('确认订单'),
                { type: 'spacer' },
                { type: 'column', props: { pad: 24, gap: 12 }, children: [{ type: 'row', props: { align: 'center' }, children: [{ type: 'icon', label: 'close', props: { size: 48 } }] }, { type: 'title', label: '支付失败' }, { type: 'text', label: '余额不足或网络异常，请重试' }, { id: 'failed-retry', type: 'button', label: '重新支付' }] },
                { type: 'spacer' },
              ],
            },
          },
        ],
      },
    },
    {
      op: 'addScreen',
      screen: {
        id: 'order',
        name: '订单状态',
        states: [
          {
            id: 'default',
            name: '默认',
            root: {
              type: 'column',
              children: [
                header('订单详情', false),
                { type: 'column', props: { pad: 16, gap: 12 }, children: [{ type: 'title', label: '商家正在备餐' }, { type: 'text', label: '预计 12:30 送达' }, { type: 'image', props: { h: 160 }, label: '骑手地图' }, { type: 'checkbox', label: '已下单', props: { checked: true } }, { type: 'checkbox', label: '备餐中', props: { checked: true } }, { type: 'checkbox', label: '配送中' }] },
                { type: 'spacer' },
                tabbar(1),
              ],
            },
          },
        ],
      },
    },
    {
      op: 'addScreen',
      screen: {
        id: 'login',
        name: '登录弹窗',
        kind: 'overlay',
        overlayType: 'modal',
        states: [
          {
            id: 'default',
            name: '默认',
            root: { type: 'column', props: { pad: 20, gap: 12 }, children: [{ type: 'row', children: [{ type: 'title', label: '登录后继续' }, { type: 'spacer' }, { id: 'login-close', type: 'icon', label: 'close' }] }, { type: 'input', label: '手机号' }, { type: 'row', children: [{ type: 'input', label: '验证码' }, { type: 'button', label: '获取', props: { variant: 'secondary' } }] }, { id: 'login-submit', type: 'button', label: '登录' }] },
          },
        ],
      },
    },
    {
      op: 'addScreen',
      screen: {
        id: 'coupon',
        name: '优惠券',
        kind: 'overlay',
        overlayType: 'sheet',
        states: [{ id: 'default', name: '默认', root: { type: 'column', props: { pad: 16, gap: 8 }, children: [{ type: 'title', label: '选择优惠券', props: { size: 'sm' } }, { type: 'listItem', label: '满 50 减 8', props: { thumb: false, trailing: '使用' } }, { type: 'listItem', label: '新人立减 5', props: { thumb: false, trailing: '使用' } }, { id: 'coupon-done', type: 'button', label: '完成' }] } }],
      },
    },
    { op: 'addCondition', condition: { id: 'logged-in', label: '已登录？' } },
    { op: 'addCondition', condition: { id: 'pay-ok', label: '支付成功？' } },
    { op: 'addCondition', condition: { id: 'cart-has', label: '购物车有商品？' } },
    { op: 'setEntry', id: 'home' },
    { op: 'addTransition', transition: { from: 'home', to: 'restaurant', elementId: 'home-r1', label: '点击餐厅' } },
    { op: 'addTransition', transition: { from: 'home', fromState: 'loading', to: 'home', toState: 'default', trigger: 'auto', action: 'setState', label: '加载完成' } },
    { op: 'addTransition', transition: { from: 'restaurant', to: 'cart-has', elementId: 'rest-cart', label: '查看购物车' } },
    { op: 'addTransition', transition: { from: 'cart-has', to: 'cart', branch: '是' } },
    { op: 'addTransition', transition: { from: 'cart-has', to: 'cart', toState: 'empty', branch: '否' } },
    { op: 'addTransition', transition: { from: 'restaurant', to: 'home', trigger: 'back', label: '返回', kind: 'back' } },
    { op: 'addTransition', transition: { from: 'cart', to: 'coupon', elementId: 'cart-coupon', label: '选优惠券' } },
    { op: 'addTransition', transition: { from: 'coupon', to: 'coupon', action: 'close', elementId: 'coupon-done', label: '完成', kind: 'back' } },
    { op: 'addTransition', transition: { from: 'cart', to: 'logged-in', elementId: 'cart-checkout', label: '去结算' } },
    { op: 'addTransition', transition: { from: 'cart', fromState: 'empty', to: 'home', label: '去看看', kind: 'back' } },
    { op: 'addTransition', transition: { from: 'logged-in', to: 'checkout', branch: '是' } },
    { op: 'addTransition', transition: { from: 'logged-in', to: 'login', branch: '否' } },
    { op: 'addTransition', transition: { from: 'login', to: 'checkout', elementId: 'login-submit', trigger: 'submit', label: '登录成功' } },
    { op: 'addTransition', transition: { from: 'login', to: 'login', action: 'close', elementId: 'login-close', label: '关闭', kind: 'back' } },
    { op: 'addTransition', transition: { from: 'checkout', to: 'pay-ok', elementId: 'checkout-pay', trigger: 'submit', label: '提交订单' } },
    { op: 'addTransition', transition: { from: 'pay-ok', to: 'order', branch: '是' } },
    { op: 'addTransition', transition: { from: 'pay-ok', to: 'checkout', toState: 'failed', branch: '否', kind: 'error' } },
    { op: 'addTransition', transition: { from: 'checkout', fromState: 'failed', to: 'pay-ok', elementId: 'failed-retry', label: '重新支付', kind: 'error' } },
  ]
  const r = applyPatch(p, ops)
  r.project.guideStep = 5
  return r.project
}
