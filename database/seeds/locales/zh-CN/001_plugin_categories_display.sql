BEGIN;

UPDATE ai_plugin_category AS category
SET name = value.name,
    name_locales_json = category.name_locales_json || value.locales,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
    ('agi', 'AGI 架构探索', '{"zh-CN":"AGI 架构探索"}'::jsonb),
    ('browser', '浏览器与网页', '{"zh-CN":"浏览器与网页"}'::jsonb),
    ('dev', '开发与运行时', '{"zh-CN":"开发与运行时"}'::jsonb),
    ('docs', '文档与渲染', '{"zh-CN":"文档与渲染"}'::jsonb),
    ('fun', '娱乐', '{"zh-CN":"娱乐"}'::jsonb),
    ('git', 'Git 与代码评审', '{"zh-CN":"Git 与代码评审"}'::jsonb),
    ('identity', '身份与通信', '{"zh-CN":"身份与通信"}'::jsonb),
    ('market', '插件市场与管理', '{"zh-CN":"插件市场与管理"}'::jsonb),
    ('memory', '记忆', '{"zh-CN":"记忆"}'::jsonb),
    ('model', '模型与账号接入', '{"zh-CN":"模型与账号接入"}'::jsonb),
    ('notify', '通知与集成', '{"zh-CN":"通知与集成"}'::jsonb),
    ('remote', '远程与移动端', '{"zh-CN":"远程与移动端"}'::jsonb),
    ('security', '安全与权限', '{"zh-CN":"安全与权限"}'::jsonb),
    ('session', '会话与消息', '{"zh-CN":"会话与消息"}'::jsonb),
    ('skill', '技能包', '{"zh-CN":"技能包"}'::jsonb),
    ('theme', '主题与外观', '{"zh-CN":"主题与外观"}'::jsonb),
    ('tools', '工具与能力', '{"zh-CN":"工具与能力"}'::jsonb),
    ('ui', 'UI 增强', '{"zh-CN":"UI 增强"}'::jsonb),
    ('usage', '用量与计费', '{"zh-CN":"用量与计费"}'::jsonb),
    ('vision', '视觉与多模态', '{"zh-CN":"视觉与多模态"}'::jsonb),
    ('voice', '语音与音频', '{"zh-CN":"语音与音频"}'::jsonb),
    ('workflow', '工作流与自动化', '{"zh-CN":"工作流与自动化"}'::jsonb),
    ('wsl', 'WSL 与 Windows 互操作', '{"zh-CN":"WSL 与 Windows 互操作"}'::jsonb)
) AS value(code, name, locales)
WHERE category.tenant_id = 100001
  AND category.taxonomy_source = 'dsh-market'
  AND category.category_code = value.code;

COMMIT;
