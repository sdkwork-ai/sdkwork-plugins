-- sdkwork:migration
-- id: 0003_plugin_marketplace_metadata
-- engine: postgres
-- module: sdkwork-plugins
-- purpose: Add localized catalog copy, plugin icon and popularity, and featured
--   placement fields for the SDKWork Plugins marketplace.
-- reversible: false
-- rollback: forward-fix (preserve the additive catalog fields and repair metadata issues in place).
-- transactional: true
-- lock: lightweight
-- lock_timeout: 2s
-- statement_timeout: 30s

BEGIN;

ALTER TABLE ai_plugin_category
    ADD COLUMN IF NOT EXISTS name_locales_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS description_locales_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ai_plugin
    ADD COLUMN IF NOT EXISTS name_locales_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS description_locales_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS icon_url TEXT,
    ADD COLUMN IF NOT EXISTS usage_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS featured_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS featured_title_locales_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS featured_description_locales_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS featured_image_url TEXT;

UPDATE ai_plugin_category
SET name_locales_json = CASE category_code
        WHEN 'code-development' THEN '{"zh-CN":"代码与开发","en-US":"Code and Development"}'::jsonb
        WHEN 'data-retrieval' THEN '{"zh-CN":"数据检索","en-US":"Data Retrieval"}'::jsonb
        WHEN 'document-processing' THEN '{"zh-CN":"文档处理","en-US":"Document Processing"}'::jsonb
        WHEN 'database-apps' THEN '{"zh-CN":"数据库应用","en-US":"Database Applications"}'::jsonb
        WHEN 'image-processing' THEN '{"zh-CN":"图像处理","en-US":"Image Processing"}'::jsonb
        WHEN 'business-apps' THEN '{"zh-CN":"商业应用","en-US":"Business Applications"}'::jsonb
    END,
    description_locales_json = CASE category_code
        WHEN 'code-development' THEN '{"zh-CN":"代码生成、审查、重构与开发工具插件","en-US":"Plugins for code generation, review, refactoring, and development."}'::jsonb
        WHEN 'data-retrieval' THEN '{"zh-CN":"搜索、检索与信息聚合插件","en-US":"Plugins for search, retrieval, and information aggregation."}'::jsonb
        WHEN 'document-processing' THEN '{"zh-CN":"文档解析、转换与内容处理插件","en-US":"Plugins for document parsing, conversion, and content processing."}'::jsonb
        WHEN 'database-apps' THEN '{"zh-CN":"数据库连接、查询与数据管理插件","en-US":"Plugins for database connections, queries, and data management."}'::jsonb
        WHEN 'image-processing' THEN '{"zh-CN":"图像识别、生成与处理插件","en-US":"Plugins for image recognition, generation, and processing."}'::jsonb
        WHEN 'business-apps' THEN '{"zh-CN":"支付、电商与商业流程插件","en-US":"Plugins for payments, commerce, and business workflows."}'::jsonb
    END
WHERE category_code IN (
    'code-development', 'data-retrieval', 'document-processing',
    'database-apps', 'image-processing', 'business-apps'
)
  AND name_locales_json = '{}'::jsonb
  AND description_locales_json = '{}'::jsonb;

UPDATE ai_plugin
SET usage_count = CASE
    WHEN COALESCE(manifest_json ->> 'downloadsCount', '') ~ '^[0-9]+$'
        THEN LEAST((manifest_json ->> 'downloadsCount')::NUMERIC, 9223372036854775807)::BIGINT
    WHEN COALESCE(manifest_json ->> 'usageCount', '') ~ '^[0-9]+$'
        THEN LEAST((manifest_json ->> 'usageCount')::NUMERIC, 9223372036854775807)::BIGINT
    ELSE usage_count
END
WHERE usage_count = 0;

UPDATE ai_plugin
SET is_featured = TRUE,
    featured_order = CASE plugin_key WHEN 'code-reviewer' THEN 10 WHEN 'web-search' THEN 20 END,
    featured_title_locales_json = CASE plugin_key
        WHEN 'code-reviewer' THEN '{"zh-CN":"代码审查助手","en-US":"Code Review Assistant"}'::jsonb
        WHEN 'web-search' THEN '{"zh-CN":"联网检索","en-US":"Web Search"}'::jsonb
    END,
    featured_description_locales_json = CASE plugin_key
        WHEN 'code-reviewer' THEN '{"zh-CN":"按仓库规范审查改动，输出可执行的修复建议与风险清单。","en-US":"Review changes against repository rules and return actionable fixes with a risk list."}'::jsonb
        WHEN 'web-search' THEN '{"zh-CN":"实时检索网页与新闻，返回带来源引用的结果摘要。","en-US":"Search the web and news in real time, with cited result summaries."}'::jsonb
    END
WHERE plugin_key IN ('code-reviewer', 'web-search')
  AND is_featured = FALSE
  AND featured_order = 0
  AND featured_title_locales_json = '{}'::jsonb
  AND featured_description_locales_json = '{}'::jsonb
  AND featured_image_url IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_usage_count_nonnegative' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_usage_count_nonnegative CHECK (usage_count >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_name_locales_object' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_name_locales_object CHECK (jsonb_typeof(name_locales_json) = 'object');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_description_locales_object' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_description_locales_object CHECK (jsonb_typeof(description_locales_json) = 'object');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_featured_title_locales_object' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_featured_title_locales_object CHECK (jsonb_typeof(featured_title_locales_json) = 'object');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_featured_description_locales_object' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_featured_description_locales_object CHECK (jsonb_typeof(featured_description_locales_json) = 'object');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_category_name_locales_object' AND conrelid = 'ai_plugin_category'::regclass
    ) THEN
        ALTER TABLE ai_plugin_category
            ADD CONSTRAINT ck_ai_plugin_category_name_locales_object CHECK (jsonb_typeof(name_locales_json) = 'object');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_category_description_locales_object' AND conrelid = 'ai_plugin_category'::regclass
    ) THEN
        ALTER TABLE ai_plugin_category
            ADD CONSTRAINT ck_ai_plugin_category_description_locales_object CHECK (jsonb_typeof(description_locales_json) = 'object');
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_catalog_featured
    ON ai_plugin (tenant_id, is_featured DESC, featured_order ASC, usage_count DESC)
    WHERE lifecycle_status = 1 AND deleted_at IS NULL;

COMMIT;
