# FlowSketch

AI 辅助的交互逻辑与低保真线框设计工具。只关心软件的操作逻辑、页面结构、页面之间的跳转和状态，不处理配色和视觉风格。

## 功能

- **引导生成**：一句话需求 → 功能清单 → 页面结构（含页面状态和浮层）→ 交互流程（含判断分支、出错路径）→ 每个页面状态的线框。每一步都可以手动修改后再继续。
- **流程总览**：页面缩略图 + 判断菱形 + 连线，ELK 自动排版；拖动节点右侧圆点到另一个节点即可连线。主流程（蓝）、返回（灰虚线）、出错（红虚线）分开显示。
- **页面编辑**：线框由元素树描述，尺寸和位置自动计算。可以从左侧拖入基础元素或组件库组件，选中元素后在右侧编辑属性和绑定交互。左右两栏显示这个页面的入口和出口。
- **对话修改**：用自然语言描述修改，AI 返回修改提议卡片，确认后才写入。
- **逻辑检查**：直接从流程图结构计算，不依赖 AI。检查入口、不可达页面、死路、浮层无法关闭、判断分支不全、状态无进入条件、出错状态无恢复路径等，能自动修复的提供一键修复。
- **导出**：流程图 SVG/PNG、全部页面线框 SVG/PNG、交互说明 Markdown、项目 JSON（可再导入）。
- 撤销/重做（Ctrl+Z / Ctrl+Shift+Z），本地自动保存（localStorage），多项目切换。

## 运行

```bash
npm install
cp .env.example .env.local   # 填入网关地址和 key
npm run dev                  # http://localhost:5199
```

`.env.local`：

```
LLM_BASE_URL=http://127.0.0.1:3300/v1
LLM_API_KEY=sk-...
VITE_LLM_MODEL=Kiro/claude-sonnet-5.5
```

浏览器只请求 `/api/llm`，由 Vite 开发服务器转发到网关并附上 key，key 不会进入前端代码。也可以在右上角 ⚙ 设置里换模型或接口地址。

## 结构

```
src/model/     数据模型、patch 操作、逻辑检查、示例项目（纯函数，有单元测试）
src/render/    线框布局算法（layout.ts）和 SVG 绘制（paint.ts），编辑器、缩略图、导出共用
src/flow/      流程画布（React Flow + ELK）
src/page/      页面线框编辑器
src/ai/        网关客户端、各步骤 prompt、执行器
src/panels/    顶栏、侧栏、属性面板、AI 面板
src/export/    导出
```

设计要点：

- AI 和人改的是同一份 `Project` 数据。AI 的所有输出都转成 `PatchOp`，经过 `applyPatch` 校验后写入；无效操作会被跳过并报告。
- LLM 不计算坐标。流程图位置由 ELK 计算，线框尺寸由 `layout.ts` 根据元素树（column/row/gap/pad/grow）计算。
- 页面状态（空、失败等）和浮层（弹窗、抽屉）是一等公民，连线可以指向具体状态。

## 测试

```bash
npx vitest run
npm run build
```
