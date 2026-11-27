BEGIN;

UPDATE ai_plugin_category AS category
SET name = value.name,
    name_locales_json = category.name_locales_json || value.locales,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
    ('official', 'sdkwork', 'Official plugins', '{"en-US":"Official plugins"}'::jsonb),
    ('agi', 'dsh-market', 'AGI Architecture Exploration', '{"en-US":"AGI Architecture Exploration"}'::jsonb),
    ('browser', 'dsh-market', 'Browser & Web', '{"en-US":"Browser & Web"}'::jsonb),
    ('dev', 'dsh-market', 'Development & Runtime', '{"en-US":"Development & Runtime"}'::jsonb),
    ('docs', 'dsh-market', 'Docs & Rendering', '{"en-US":"Docs & Rendering"}'::jsonb),
    ('fun', 'dsh-market', 'Just for Fun', '{"en-US":"Just for Fun"}'::jsonb),
    ('git', 'dsh-market', 'Git & Code Review', '{"en-US":"Git & Code Review"}'::jsonb),
    ('identity', 'dsh-market', 'Identity & Communication', '{"en-US":"Identity & Communication"}'::jsonb),
    ('market', 'dsh-market', 'Plugin Markets & Managers', '{"en-US":"Plugin Markets & Managers"}'::jsonb),
    ('memory', 'dsh-market', 'Memory', '{"en-US":"Memory"}'::jsonb),
    ('model', 'dsh-market', 'Models & Providers', '{"en-US":"Models & Providers"}'::jsonb),
    ('notify', 'dsh-market', 'Notifications & Integrations', '{"en-US":"Notifications & Integrations"}'::jsonb),
    ('remote', 'dsh-market', 'Remote & Mobile', '{"en-US":"Remote & Mobile"}'::jsonb),
    ('security', 'dsh-market', 'Security & Permissions', '{"en-US":"Security & Permissions"}'::jsonb),
    ('session', 'dsh-market', 'Sessions & Messages', '{"en-US":"Sessions & Messages"}'::jsonb),
    ('skill', 'dsh-market', 'Skills', '{"en-US":"Skills"}'::jsonb),
    ('theme', 'dsh-market', 'Themes & Appearance', '{"en-US":"Themes & Appearance"}'::jsonb),
    ('tools', 'dsh-market', 'Tools & Capabilities', '{"en-US":"Tools & Capabilities"}'::jsonb),
    ('ui', 'dsh-market', 'UI Enhancements', '{"en-US":"UI Enhancements"}'::jsonb),
    ('usage', 'dsh-market', 'Usage & Billing', '{"en-US":"Usage & Billing"}'::jsonb),
    ('vision', 'dsh-market', 'Vision & Multimodal', '{"en-US":"Vision & Multimodal"}'::jsonb),
    ('voice', 'dsh-market', 'Voice & Audio', '{"en-US":"Voice & Audio"}'::jsonb),
    ('workflow', 'dsh-market', 'Workflow & Automation', '{"en-US":"Workflow & Automation"}'::jsonb),
    ('wsl', 'dsh-market', 'WSL & Windows Interop', '{"en-US":"WSL & Windows Interop"}'::jsonb)
) AS value(code, taxonomy_source, name, locales)
WHERE category.tenant_id = 100001
  AND category.taxonomy_source = value.taxonomy_source
  AND category.category_code = value.code;

COMMIT;
