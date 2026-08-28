# Agent Note: The confirmed no-workspace state and the flow opening discipline

Status: implemented

[English](2026-08-28-no-workspace-empty-state-never-auto-opens.md) | 中文

## 问题

两个故障同根。其一，[单一路径规则](../simplification/2026-07-31-one-route-to-add-a-workspace.zh.md)让空且已就绪的列表上的任何选择器打开请求都被直接消费进目录流程——而无工作区的 composer 本身就是该选择器的触发器（在惰性输入卡上一次误触的 Enter、空格或点击都会打开它）。网络不稳时，Workspace 基线迟到或瞬时读空，用户就会看到「添加工作区」对话框仿佛自己弹出来，而且屡次发生在连接最差的时刻。其二，无工作区的呈现只有一个占位 chip 加一个惰性 composer：没有标记说明缺什么，没有直接动作，也没有喘息的空间。

## 决策

**检测永远不打开任何东西。** `addIsTheOnlyEntry` 自动拉起已从 `WorkspacePickFlow` 移除。选择（pick）手势永远先出菜单——没有可列内容时菜单只剩单独的添加一行——因此空的、迟到的或被网络清空的列表都不再能拉起选取交互。[单一路径笔记](../simplification/2026-07-31-one-route-to-add-a-workspace.zh.md)的单一路径规则保留；其「锚点手势*就是*该动作」的条款由本笔记取代。

**只有明确的添加手势直接拉起流程。** 属主约定（`EmptyWorkspaceOwnerProps`）新增 `intent: 'pick' | 'add'`。chip、composer 触发器与所有菜单选择都是 `pick`；具名的添加入口——主视觉区空状态的按钮、仅添加的侧边栏区头（`addOnly` 隐含添加意图）——是 `add`，添加意图的打开请求被直接消费进流程，并沿用原有 `flowBusy` 闸门。

**唯一的重开路径是滞留草稿。** `WorkspacePickFlow` 按界面持久化其打开请求（dialog-draft 前缀下的 `workspace.addFlow.hero`／`workspace.addFlow.sidebar`）：刷新或浏览器崩溃撕裂的已打开流程会重新挂载为打开，任何一次有意的结束（选取、取消、错误关闭）都会清除该请求。这是流程中仅存的自动打开，它以「一次交互被撕裂」为键，永远不以「列表看起来是空的」为键。

**只在基线落定后宣称空。** 主视觉区新的 `conversation.hero.workspace.empty` 洞（由 ui-workspace 的 `WorkspaceHeroEmpty` 填充）与侧边栏主体的空区块，只在 `phase === 'ready'` 且不存在任何 Workspace 时渲染「暂无工作区」标记与一个添加操作；挂起或失败的列表证明不了任何事，什么都不渲染——主视觉区保持普通外观，侧边栏保留无会话标记。两个空状态在未组合任何选取流程时整体隐藏其操作（死按钮规则；侧边栏主体的标记保留）。

**留白。** 主视觉区空状态把标记与主按钮居中，上下各留 clearance，嵌在 composer 栈内；侧边栏区块同样为标记与 outline 操作留出内边距。

## 测试

`workspace-picker.client.spec.tsx` 钉住空且就绪列表上的单行添加菜单（选其行拉起流程）、`intent="add"` 的直接拉起、滞留草稿重开、以及采纳后草稿清除。`workspace-hero-empty.client.spec.tsx` 钉住就绪空渲染、挂起／有列表／无占用三个 null 分支与迟到的占用翻转。`workspace-browser.client.spec.tsx` 钉住侧边栏两种分组模式下的标记与添加操作、以及未落定基线上无会话标记的存活。`skeleton.client.spec.tsx` 钉住主视觉区路由：chip → `pick`，空状态 `requestAdd` → `add`。

## 考虑过的替代方案

**保留锚点手势的直接拉起（菜单 ⇔ 存在选择）。** 否决：该规则的前提是一行菜单浪费一次点击，但浪费点击不是故障模式——不请自来的对话框才是。用户指令把不变量定死：永远不得以检测到的空为准自动拉起，唯一例外是滞留表单重开。空状态的具名按钮恢复了该规则本来保护的一击即达添加路径，其中不含任何检测。

**为首跑用户重开流程（空列表意味着新用户）。** 否决：决策时刻，首跑与被网络清空的列表无从区分——这正是本次移除的误读。空状态按钮只需一次明确点击。

**无 Workspace 时隐藏主视觉区 chip。** 否决：工作区行同时承载 agent-preset chip，且 chip 仍是之后任何列表的 pick 路径。

**把无会话标记也闸在 sessions 基线上。** 暂缓：sessions 列表有自己的相位与标记语义；上报的故障与它无关。

## 后果

- 主视觉区 chip 的 `aria-haspopup="menu"` 宣告重新在所有状态下为真：pick 手势永远产生菜单。
- 经 chip 在空列表上添加比此前多一次点击；空状态按钮是一击即达的路径，且恰在列表确认清空时存在。
- 未占用的目录流洞让主视觉区空状态只显示标记、侧边栏主体没有操作——与其余添加界面一致的无死入口姿态。
- 滞留表单重开同样适用于原生选择器占用者：OS 对话框打开时崩溃，下次加载会再询问一次。接受：这与「接续原处」是同一契约。
