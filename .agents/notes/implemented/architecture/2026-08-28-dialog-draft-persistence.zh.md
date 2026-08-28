# Agent Note: Dialog draft persistence across refresh and crash

Status: implemented

[English](2026-08-28-dialog-draft-persistence.md) | 中文

## 问题

页面刷新或浏览器崩溃会摧毁 web client 中每一个填到一半的非临时性对话框：Workspace／Session 重命名草稿、「选择工作区目录」对话框走到的层级、打开中的路径编辑器、以及打开中的新建文件夹表单，全部只存在于组件状态里。Composer 草稿已经通过运行时 store 的持久化在重载后存活，因此损失恰好集中在用户投入最多主动输入的地方——他们主动打开的对话框。在不稳定的网络上，两者叠加：连接在填表途中断开，重载又把表单本身丢掉。

## 决策

**ui-primitives 中的一个共享原语。** `readDialogDraft`／`writeDialogDraft`／`clearDialogDraft` 按 key 存取整份 JSON 值，前缀 `dsh.draft.`——与其他持久化 client 单元一致的 `dsh.` 命名空间纪律。存储失败（配额、隐私模式）只禁用持久化、不破坏对话框，与 snapshot store 的姿态一致；损坏条目被移除并按不存在读取。

**「临时」由生命周期规则提供，而非介质。** 存活期间，界面把可恢复状态逐变更写盘；有意的结束——成功提交或明确取消——清除 key；突然的撕裂（刷新、崩溃）留下最后一次写入，下一次挂载即恢复。没有过期也没有版本化：key 廉价、短小，且因每次有意结束都移除而自我约束。

**Workspace 流程是首个旗舰采用。** `WorkspacePickFlow` 按界面持久化其打开请求；配合[打开纪律变更](../bug-fix/2026-08-28-no-workspace-empty-state-never-auto-opens.zh.md)，该滞留请求是整个流程中仅存的自动打开。浏览占用者（`BrowseDirectoryFlow`）通过 `DirectoryBrowser` 上的 `restoreDraft`／`onDraftChange` 缝隙持久化对话框的交互中状态——列出的层级、打开的路径编辑器文本、隐藏开关、打开中的新建文件夹草稿——key 由两个流程界面共用（对话框无论从哪里拉起都是同一任务，且同一时刻只有一次选取交互）。确认选取清除草稿；被关闭的对话框为下一次主动打开保留位置。重命名对话框按目标（Workspace id／Session id）持久化草稿，下次重命名同一目标时恢复；它们不自动重开——目标就在可见的一行之外，为一个用户可能已不再注视的行重开模态框，是用频繁打扰换罕见的击键损失。

**分类决定逐界面的推进。** 对 web client 模态界面的完整盘点分三类：

- *表单类（下一批采用）*：设置中模型 provider 编辑器（`ProviderEditor.tsx`——模型目录草稿；其 API-key 字段**排除在持久化之外：秘密永不进入 localStorage**）、问询面板的答复编辑器（`QuestionComposer.tsx`——问题本身 host 持久，所输入的答复不是）、agent-preset 复制对话框、消息反馈备注、goal-objective 编辑器、以及插件卡的暂存表单。
- *导航类（持久化位置，不持久化「打开」）*：模型 fetch-candidates 选择器、trajectory 搜索／时间线状态、workspace 搜索——恢复层级或查询即可，不自动重开。
- *临时类（永不持久化）*：删除／确认对话框、审批与计划评审面板（其等待 host 持久）、灯箱、菜单、toast。

## 测试

`dialog-draft.client.spec.ts` 钉住往返、损坏条目移除、以及无 localStorage 与存储失败的各分支。`client-flow.client.spec.tsx` 端到端钉住浏览缝隙：打开期间逐变更写盘、确认选取清除、滞留草稿种子恢复层级。`directory-browser.client.spec.tsx` 钉住打开边的恢复（层级、隐藏开关、新建文件夹表单）与上报草稿的形状，包括落列前省略 `path` 的报告。`workspace-picker.client.spec.tsx` 与 `workspace-browser.client.spec.tsx` 钉住流程打开请求与重命名草稿。

## 考虑过的替代方案

**每个对话框一个持久化运行时 store（带 `persist` 的 `defineStore`）。** 否决：store 带来共享身份、多实例与 actions 机制，而对话框局部状态并不需要；原语只是三个函数加一个前缀，store 仍是超越对话框生命周期的状态的正确工具。

**用 `sessionStorage` 作介质。** 否决：它活过刷新但活不过浏览器崩溃，而崩溃恢复是需求的一半。「临时」来自有意结束即清除的生命周期，而非介质；残留只出现在机制为之存在的突然撕裂之后。

**自动持久化每个对话框的打开标志。** 否决：重载后重开确认框与只读对话框是噪音；只有交互状态值得恢复的界面才重开，且各自明确采用。

**随草稿一并持久化错误文本。** 否决：诊断是瞬态的；在恢复的草稿旁恢复陈旧错误会误报当前这次尝试。

**带版本化的每对话框结构化 schema。** 暂否决：已采用的界面存的都是小字面对象，缺失成员即默认值，未知的旧形状会无害地退化到默认。当某个草稿大到静默默认会丢真实工作时再引入版本化。

## 后果

- 填表途中刷新或崩溃现在可以接续：添加工作区对话框在原处重开，重开的重命名带着已输入的名称。
- 被有意取消的浏览对话框记得它的位置——设计上的接续，与重开不同；下一次拉起从上一次离开处开始。
- localStorage 多出少量 `dsh.draft.*` 单元，寿命受有意结束约束；最坏残留是崩溃后一份对话框状态——那正是用户想要找回的状态。
- 秘密排除是未来所有采用的常设规则：凭据与 token 字段永不经过本机制，无论其对话框属于哪一类。
