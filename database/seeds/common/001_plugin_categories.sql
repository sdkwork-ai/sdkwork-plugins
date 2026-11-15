-- Plugin category seed derived from the agent plugin category set.
--
-- The registry starts empty by design only for contract bootstrap; a fresh
-- deployment must still offer the categories operators actually file plugins
-- under. The inserts are idempotent so `seedOnBoot` can run on every start
-- without duplicating or resurrecting a renamed category.

INSERT INTO ai_plugin_category (
    id,
    uuid,
    tenant_id,
    organization_id,
    category_code,
    name,
    description,
    sort_order,
    lifecycle_status
)
VALUES
    (
        9300000000001,
        'cat.plugin.code-development',
        100001,
        0,
        'code-development',
        '代码与开发',
        '代码生成、审查、重构与开发工具插件',
        10,
        1
    ),
    (
        9300000000002,
        'cat.plugin.data-retrieval',
        100001,
        0,
        'data-retrieval',
        '数据检索',
        '搜索、检索与信息聚合插件',
        20,
        1
    ),
    (
        9300000000003,
        'cat.plugin.document-processing',
        100001,
        0,
        'document-processing',
        '文档处理',
        '文档解析、转换与内容处理插件',
        30,
        1
    ),
    (
        9300000000004,
        'cat.plugin.database-apps',
        100001,
        0,
        'database-apps',
        '数据库应用',
        '数据库连接、查询与数据管理插件',
        40,
        1
    ),
    (
        9300000000005,
        'cat.plugin.image-processing',
        100001,
        0,
        'image-processing',
        '图像处理',
        '图像识别、生成与处理插件',
        50,
        1
    ),
    (
        9300000000006,
        'cat.plugin.business-apps',
        100001,
        0,
        'business-apps',
        '商业应用',
        '支付、电商与商业流程插件',
        60,
        1
    )
ON CONFLICT (tenant_id, category_code) DO NOTHING;
