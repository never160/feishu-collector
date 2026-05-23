// api/process.js - Markdown 导入版
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { link, text } = req.body;
    if (!link || !text) {
      return res.status(400).json({ error: '缺少 link 或 text' });
    }

    const aiResult = await callDeepSeek(text);
    const feishuResult = await saveToFeishu(link, aiResult.title, aiResult.summary, aiResult.category);

    return res.status(200).json({
      message: `已存档：${aiResult.category} - ${aiResult.title}`,
      category: aiResult.category,
      title: aiResult.title,
      feishuResponse: feishuResult,
    });
  } catch (error) {
    return res.status(500).json({ error: '处理失败', details: error.message });
  }
}

async function callDeepSeek(text) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个内容整理助手。用户会提供一段文字，请完成两项任务：
1. 提炼出结构化摘要（操作步骤/产品清单/核心论点），简洁清晰。
2. 给内容打上一个粗粒度分类标签（如：穿搭、美食、科技、时政、旅行、家居、效率工具、健康等），自由发挥但保证大类不出错。

请严格按照以下JSON格式输出，不要包含任何其他内容：
{
  "title": "内容的简要标题",
  "summary": "结构化摘要内容",
  "category": "分类标签"
}`
        },
        { role: 'user', content: text }
      ],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error('DeepSeek 返回异常: ' + JSON.stringify(data));
  }
  const content = data.choices[0].message.content.trim();
  return JSON.parse(content);
}

async function saveToFeishu(link, title, summary, category) {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const spaceId = process.env.FEISHU_SPACE_ID;

  // 获取 token
  const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.code !== 0) {
    return { step: 'token', result: tokenData };
  }
  const token = tokenData.tenant_access_token;

  // 构建 Markdown 内容
  const mdContent = `# ${title}\n\n**原始链接**：${link}\n\n**分类**：${category}\n\n## 结构化摘要\n\n${summary}`;

  // 使用导入 Markdown 接口创建文档
  const importRes = await fetch(
    `https://open.feishu.cn/open-apis/wiki/v2/spaces/${spaceId}/nodes/import`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        obj_type: 'docx',
        parent_node_token: spaceId,
        title: title,
        content: mdContent,
      }),
    }
  );
  const importData = await importRes.json();
  return { step: 'import', result: importData };
}
