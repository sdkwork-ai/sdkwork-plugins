/**
 * Offline Official-bundle catalog data for the dsh-market seed.
 *
 * Authority: `sdkwork-birdcoder2/packages/util/official-bundles/src/bundles.ts`,
 * `catalog.generated.ts`, the package manifests, and each package's `locale/`
 * metadata. Versions are intentionally pinned to the manifests read with this
 * catalog; regenerate this data when the authoritative bundle list changes.
 */

const REPOSITORY_URL = 'https://github.com/deepseek-ai/deepseek-harness';

/** The SDKWork-owned category that appears before registry product categories. */
export const OFFICIAL_CATEGORY = Object.freeze({
  code: 'official',
  labels: Object.freeze({ 'zh-CN': '官方插件', 'en-US': 'Official plugins' }),
  sortOrder: 0,
  taxonomySource: 'sdkwork',
});

/** The 17 optional and 2 on-demand bundles in authoritative admission order. */
export const OFFICIAL_BUNDLES = Object.freeze([
  {
    packageName: '@deepseek-ai/dsh-cua-bundle',
    packagePath: 'packages/experimental/cua-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Computer use', 'zh-CN': 'Computer Use' },
    description: {
      'en-US': 'Allow the agent to directly control applications on your computer.',
      'zh-CN': '允许 agent 直接操作电脑上的应用程序。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-cua-mcp',
    packagePath: 'packages/experimental/cua-mcp',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Computer use MCP server', 'zh-CN': 'Computer Use MCP 服务器' },
    description: {
      'en-US': 'Serve Computer Use to Codex, Claude Code, and other MCP clients from the cua-mcp profile: cua_run_code runs persistent programs against desktop applications, and cua_reset clears them.',
      'zh-CN': '通过 cua-mcp profile 向 Codex、Claude Code 等 MCP 客户端提供 Computer Use：cua_run_code 对桌面应用运行持久程序，cua_reset 清空程序环境。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-timeline',
    packagePath: 'packages/experimental/timeline',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Timeline', 'zh-CN': '时间线' },
    description: {
      'en-US': 'Replace Todo in long-running sessions. The agent keeps a task tree up to date. Follow progress with a live progress bar and timed reports.',
      'zh-CN': '在长程任务中替代待办工具。智能体主动维护任务树，你可以通过实时进度条和定时报告跟踪进展。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-session-search',
    packagePath: 'packages/experimental/session-search',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Session search', 'zh-CN': '会话搜索' },
    description: {
      'en-US': 'Ask about earlier work, such as “How did we fix the pool leak last week?”, and the agent searches your earlier sessions in the same workspace to answer.',
      'zh-CN': '询问以往的工作，例如“上周我们是怎么修好连接池泄漏的？”，智能体会搜索同一工作区的历史会话来回答。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-ralph-bundle',
    packagePath: 'packages/experimental/ralph-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Ralph loops', 'zh-CN': 'Ralph 循环' },
    description: {
      'en-US': 'Ask for a Ralph loop with a goal, and the agent starts a fresh agent on it round after round until the goal is met, a blocker is reported, or the round limit is reached.',
      'zh-CN': '要求用 Ralph 循环完成一个目标后，智能体会一轮接一轮地启动新的智能体处理它，直到目标达成、报告受阻或达到轮次上限。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-terminal-bundle',
    packagePath: 'packages/experimental/terminal-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Persistent terminals', 'zh-CN': '持久终端' },
    description: {
      'en-US': 'Gives the agent terminals that open as sidebar tabs you can watch and take over by typing in them. Processes keep running between tool calls, so it can start a dev server or REPL and come back later to read output; it can also read terminals you open yourself.',
      'zh-CN': '为智能体提供以侧栏标签页打开的终端，你可以旁观，也可以直接在其中键入来接管。进程在多次工具调用之间持续运行，因此它可以启动开发服务器或 REPL，稍后再读取输出；它也能读取你自己打开的终端。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-badge-skill-bundle',
    packagePath: 'packages/experimental/badge-skill-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'DSH badge skill', 'zh-CN': 'DSH 徽章技能' },
    description: {
      'en-US': 'Let agents add a “powered by dsh” badge to documents, pull requests, and other outputs.',
      'zh-CN': '让 Agent 为文档、PR 等产出添加「powered by dsh」徽章。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-session-titles-bundle',
    packagePath: 'packages/experimental/session-titles-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Conversation-following titles', 'zh-CN': '随对话更新的标题' },
    description: {
      'en-US': "Writes a session's title from all of your messages and updates it when the main task changes, instead of only from the first message.",
      'zh-CN': '根据你的所有消息生成会话标题，并在主要任务变化时更新，而不是只根据第一条消息生成。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-voice-input-bundle',
    packagePath: 'packages/experimental/voice-input-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Voice input', 'zh-CN': '语音输入' },
    description: {
      'en-US': 'Transcribe recordings locally with SenseVoice; first use requires installing dependencies.',
      'zh-CN': '在本机使用 SenseVoice 转写录音，首次使用需安装依赖。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-cot-translation-bundle',
    packagePath: 'packages/experimental/cot-translation-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Machine translation of reasoning', 'zh-CN': '思考过程机器翻译' },
    description: {
      'en-US': 'Translates expanded Think rows into your chosen language as the agent writes them, and View original switches back.',
      'zh-CN': '智能体输出时，把展开的“思考”行翻译成你选择的语言，点击“查看原文”可切换回原文。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-auto-review',
    packagePath: 'packages/experimental/auto-review',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Auto authorization review', 'zh-CN': '自动授权审查' },
    description: {
      'en-US': 'Adds an Auto review access mode: before each tool call, a model checks it against what you asked for, runs allowed calls at once, and holds denied calls for your approval.',
      'zh-CN': '提供“自动审查”访问模式：每次工具调用前，由模型对照你的要求检查，获准的调用立即运行，被拒绝的调用等你审批。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-inspector-profile',
    packagePath: 'packages/experimental/inspector-profile',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Developer tools', 'zh-CN': '开发者工具' },
    description: {
      'en-US': 'For troubleshooting: view what DSH recorded for a session in Session log, inspect per-turn and per-step statistics in the Statistics tab, and debug the DSH backend in Chrome DevTools.',
      'zh-CN': '用于排查问题：在「会话数据诊断」中查看 DSH 为会话记录的内容，在「统计」页签查看每轮/每步的上下文、耗时、缓存和工具成本，并在 Chrome DevTools 中调试 DSH 后端。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-liveshare',
    packagePath: 'packages/experimental/liveshare',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'LiveShare Session Sharing', 'zh-CN': 'LiveShare 会话分享' },
    description: {
      'en-US': 'Share the current Session with a colleague, who can drive it in a browser, edit files inside the granted workspace when the share allows writes, or branch their own Session from the completed history.',
      'zh-CN': '把当前会话分享给同事，对方可在浏览器中驱动该会话、在分享允许写入时修改授权工作区内的文件，或从已完成历史分支出自己的会话。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-plugin-market-bundle',
    packagePath: 'packages/experimental/plugin-market-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Custom plugin indexes', 'zh-CN': '自定义插件索引' },
    description: {
      'en-US': 'Adds a Discover tab to Plugins, where you browse and install plugins from plugin indexes you add.',
      'zh-CN': '在插件页添加“发现”标签页，从你添加的插件索引中浏览和安装插件。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-tool-worktree',
    packagePath: 'packages/experimental/tool-worktree',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Git worktrees', 'zh-CN': 'Git 工作树' },
    description: {
      'en-US': 'Ask for work on a new branch, and the agent creates a separate Git worktree and continues there, leaving your current checkout as it is.',
      'zh-CN': '要求在新分支上工作时，智能体会创建单独的 Git 工作树并在那里继续，你当前的工作区保持原样。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-experimental-forge-bundle',
    packagePath: 'packages/experimental/forge-bundle',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Change requests & worktrees', 'zh-CN': '变更请求与工作树' },
    description: {
      'en-US': 'Keep linked change requests beside your conversation, both GitHub pull requests and GitLab merge requests: follow checks and reviews, inspect diffs, and send feedback to the agent. Review local changes and use a separate worktree to isolate each task. GitHub features require the gh CLI installed and signed in on the host. GitLab merge requests require the glab CLI signed in on the host.',
      'zh-CN': '在会话侧栏集中跟踪关联的代码变更请求，支持 GitHub PR 以及 GitLab MR：查看检查状态、评审意见与代码差异，并把修改建议交给智能体继续处理。也可查看本地改动，用独立工作区隔离任务。GitHub 功能需要本机安装 gh 并登录。GitLab 合并请求需要本机安装 glab 并登录。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-deepseek-chat-import',
    packagePath: 'packages/experimental/deepseek-chat-import',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'DeepSeek chat import', 'zh-CN': 'DeepSeek 会话导入' },
    description: {
      'en-US': 'Upload a chat export ZIP from the DeepSeek website with the button next to New session; each conversation becomes a session in the workspace you choose.',
      'zh-CN': '点击“新建会话”旁的按钮上传 DeepSeek 官网导出的 ZIP 文件，每段对话都会成为所选工作区中的一个会话。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-subagent-claude-code',
    packagePath: 'packages/subagent/subagent-claude-code',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Claude Code subagent', 'zh-CN': 'Claude Code 子智能体' },
    description: {
      'en-US': 'Delegate one task to Claude Code using its native authentication and settings.',
      'zh-CN': '使用 Claude Code 原生认证和设置委派单个任务。',
    },
  },
  {
    packageName: '@deepseek-ai/dsh-subagent-codex',
    packagePath: 'packages/subagent/subagent-codex',
    version: '0.2.3-alpha.2',
    title: { 'en-US': 'Codex subagent', 'zh-CN': 'Codex 子智能体' },
    description: {
      'en-US': 'Delegate one task to Codex using its native authentication and settings.',
      'zh-CN': '使用 Codex 原生认证和设置委派单个任务。',
    },
  },
].map(bundle => Object.freeze({ ...bundle })));

/** Canonical source URL used as the stable catalog identity. */
export function officialCatalogUrl(bundle) {
  return `${REPOSITORY_URL}/tree/main/${bundle.packagePath}`;
}

/** Registry entry shape emitted for one Official bundle. */
export function officialCatalogEntry(bundle) {
  return {
    name: bundle.title['en-US'],
    nameLocales: bundle.title,
    owner: 'deepseek-ai',
    url: officialCatalogUrl(bundle),
    category: [OFFICIAL_CATEGORY.code],
    description: bundle.description,
    npm: bundle.packageName,
    version: bundle.version,
  };
}

function npmIdentity(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function urlIdentity(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'github.com'
      ? parsed.pathname.replace(/\.git$/iu, '').replace(/\/+$/u, '').toLowerCase()
      : '';
  } catch {
    return '';
  }
}

/** Find the Official bundle claimed by a registry URL or npm package identity. */
export function officialBundleForEntry(entry) {
  const npm = npmIdentity(entry?.npm);
  const path = urlIdentity(entry?.url);
  return OFFICIAL_BUNDLES.find(bundle => bundle.packageName.toLowerCase() === npm
    || urlIdentity(officialCatalogUrl(bundle)) === path) ?? null;
}
