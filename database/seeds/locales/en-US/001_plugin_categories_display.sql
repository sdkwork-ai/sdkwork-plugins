BEGIN;

UPDATE ai_plugin_category AS category
SET name = value.name,
    name_locales_json = category.name_locales_json || value.locales,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
    ('agi', 'AGI Architecture Exploration', '{"en-US":"AGI Architecture Exploration"}'::jsonb),
    ('browser', 'Browser & Web', '{"en-US":"Browser & Web"}'::jsonb),
    ('dev', 'Development & Runtime', '{"en-US":"Development & Runtime"}'::jsonb),
    ('docs', 'Docs & Rendering', '{"en-US":"Docs & Rendering"}'::jsonb),
    ('fun', 'Just for Fun', '{"en-US":"Just for Fun"}'::jsonb),
    ('git', 'Git & Code Review', '{"en-US":"Git & Code Review"}'::jsonb),
    ('identity', 'Identity & Communication', '{"en-US":"Identity & Communication"}'::jsonb),
    ('market', 'Plugin Markets & Managers', '{"en-US":"Plugin Markets & Managers"}'::jsonb),
    ('memory', 'Memory', '{"en-US":"Memory"}'::jsonb),
    ('model', 'Models & Providers', '{"en-US":"Models & Providers"}'::jsonb),
    ('notify', 'Notifications & Integrations', '{"en-US":"Notifications & Integrations"}'::jsonb),
    ('remote', 'Remote & Mobile', '{"en-US":"Remote & Mobile"}'::jsonb),
    ('security', 'Security & Permissions', '{"en-US":"Security & Permissions"}'::jsonb),
    ('session', 'Sessions & Messages', '{"en-US":"Sessions & Messages"}'::jsonb),
    ('skill', 'Skills', '{"en-US":"Skills"}'::jsonb),
    ('theme', 'Themes & Appearance', '{"en-US":"Themes & Appearance"}'::jsonb),
    ('tools', 'Tools & Capabilities', '{"en-US":"Tools & Capabilities"}'::jsonb),
    ('ui', 'UI Enhancements', '{"en-US":"UI Enhancements"}'::jsonb),
    ('usage', 'Usage & Billing', '{"en-US":"Usage & Billing"}'::jsonb),
    ('vision', 'Vision & Multimodal', '{"en-US":"Vision & Multimodal"}'::jsonb),
    ('voice', 'Voice & Audio', '{"en-US":"Voice & Audio"}'::jsonb),
    ('workflow', 'Workflow & Automation', '{"en-US":"Workflow & Automation"}'::jsonb),
    ('wsl', 'WSL & Windows Interop', '{"en-US":"WSL & Windows Interop"}'::jsonb)
) AS value(code, name, locales)
WHERE category.tenant_id = 100001
  AND category.taxonomy_source = 'dsh-market'
  AND category.category_code = value.code;

COMMIT;
