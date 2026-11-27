BEGIN;

UPDATE ai_plugin_category AS category
SET name = value.name,
    name_locales_json = category.name_locales_json || value.locales,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
    ('official', 'sdkwork', '官方插件', '{"zh-CN":"官方插件"}'::jsonb),
    ('agi', 'dsh-market', 'AGI 架构探索', '{"zh-CN":"AGI 架构探索"}'::jsonb),
    ('browser', 'dsh-market', '浏览器与网页', '{"zh-CN":"浏览器与网页"}'::jsonb),
    ('dev', 'dsh-market', '开发与运行时', '{"zh-CN":"开发与运行时"}'::jsonb),
    ('docs', 'dsh-market', '文档与渲染', '{"zh-CN":"文档与渲染"}'::jsonb),
    ('fun', 'dsh-market', '娱乐', '{"zh-CN":"娱乐"}'::jsonb),
    ('git', 'dsh-market', 'Git 与代码评审', '{"zh-CN":"Git 与代码评审"}'::jsonb),
    ('identity', 'dsh-market', '身份与通信', '{"zh-CN":"身份与通信"}'::jsonb),
    ('market', 'dsh-market', '插件市场与管理', '{"zh-CN":"插件市场与管理"}'::jsonb),
    ('memory', 'dsh-market', '记忆', '{"zh-CN":"记忆"}'::jsonb),
    ('model', 'dsh-market', '模型与账号接入', '{"zh-CN":"模型与账号接入"}'::jsonb),
    ('notify', 'dsh-market', '通知与集成', '{"zh-CN":"通知与集成"}'::jsonb),
    ('remote', 'dsh-market', '远程与移动端', '{"zh-CN":"远程与移动端"}'::jsonb),
    ('security', 'dsh-market', '安全与权限', '{"zh-CN":"安全与权限"}'::jsonb),
    ('session', 'dsh-market', '会话与消息', '{"zh-CN":"会话与消息"}'::jsonb),
    ('skill', 'dsh-market', '技能包', '{"zh-CN":"技能包"}'::jsonb),
    ('theme', 'dsh-market', '主题与外观', '{"zh-CN":"主题与外观"}'::jsonb),
    ('tools', 'dsh-market', '工具与能力', '{"zh-CN":"工具与能力"}'::jsonb),
    ('ui', 'dsh-market', 'UI 增强', '{"zh-CN":"UI 增强"}'::jsonb),
    ('usage', 'dsh-market', '用量与计费', '{"zh-CN":"用量与计费"}'::jsonb),
    ('vision', 'dsh-market', '视觉与多模态', '{"zh-CN":"视觉与多模态"}'::jsonb),
    ('voice', 'dsh-market', '语音与音频', '{"zh-CN":"语音与音频"}'::jsonb),
    ('workflow', 'dsh-market', '工作流与自动化', '{"zh-CN":"工作流与自动化"}'::jsonb),
    ('wsl', 'dsh-market', 'WSL 与 Windows 互操作', '{"zh-CN":"WSL 与 Windows 互操作"}'::jsonb)
) AS value(code, taxonomy_source, name, locales)
WHERE category.tenant_id = 100001
  AND category.taxonomy_source = value.taxonomy_source
  AND category.category_code = value.code;

COMMIT;
