// Pot-App 插件的入口函数，由主程序在需要翻译时调用。
// 所有必要的上下文（配置、工具函数等）都由 Pot-App 在调用时注入到此函数的作用域中。
async function translate(query,
  // 解构 query 对象以获取所需参数
  {
    text, // 需要翻译的文本
    from, // 源语言代码 (Pot-App 内部代码)
    to, // 目标语言代码 (Pot-App 内部代码)
    config, // 用户在设置中配置的参数对象
    setResult, // 用于返回结果的回调函数
    http, // Tauri 注入的 HTTP 客户端
    language, // 语言代码映射表 (来自 info.json)
    utils // 其他工具函数
  }
) {
  // --- 1. 参数校验和准备 ---
  const service = config.service_choice |
| 'openai'; // 默认为 OpenAI
  const apiKey = service === 'openai'? config.openai_api_key : config.gemini_api_key;
  const model = service === 'openai'? config.openai_model : config.gemini_model;

  if (!apiKey) {
    setResult(null, '错误：未配置 ' + (service === 'openai'? 'OpenAI' : 'Gemini') + ' 的 API Key。');
    return;
  }

  if (!model) {
    setResult(null, '错误：未配置 ' + (service === 'openai'? 'OpenAI' : 'Gemini') + ' 的模型名称。');
    return;
  }

  // --- 2. 确定 API 端点和认证头 ---
  let effectiveBaseUrl;
  let headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (service === 'openai') {
    // 如果用户提供了自定义端点，则使用它；否则使用 OpenAI 官方端点。
    effectiveBaseUrl = config.base_url |
| 'https://api.openai.com';
  } else { // service === 'gemini'
    // 如果用户提供了自定义端点，则使用它；否则使用 Gemini 的 OpenAI 兼容端点。
    // 这一兼容性是实现统一逻辑的关键。
    effectiveBaseUrl = config.base_url |
| 'https://generativelanguage.googleapis.com/v1beta';
    // Gemini 的兼容端点需要通过 URL 路径来区分，而不是主机名
    if (!config.base_url) {
        effectiveBaseUrl += '/openai';
    }
  }

  const apiUrl = `${effectiveBaseUrl}/chat/completions`;

  // --- 3. 构建 API 请求体 ---
  // 获取目标语言的人类可读描述，用于构建更精确的提示词
  const targetLanguage = language.langMap[to] |
| to;
  const sourceLanguage = language.langMap[from] |
| from;

  // 默认系统提示词
  const defaultSystemPrompt = `You are a professional, authentic translation engine. Your sole purpose is to accurately translate text from ${sourceLanguage} to ${targetLanguage}.
Do not add any explanations, annotations, or any content other than the translated text itself.
Maintain the original formatting, including line breaks, as much as possible.
Translate the following text:`;

  const systemPrompt = config.system_prompt |
| defaultSystemPrompt;

  const requestBody = {
    model: model,
    messages: [{
      role: 'system',
      content: systemPrompt
    }, {
      role: 'user',
      content: text
    }],
    temperature: 0.7, // 可根据需要调整
    stream: false // Pot-App 插件目前不支持流式输出
  };

  // --- 4. 发送网络请求并处理响应 ---
  try {
    // 使用 Tauri 注入的 http.fetch 方法发送请求
    const response = await http.fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: http.Body.json(requestBody), // 使用 http.Body.json 构造请求体
      responseType: http.ResponseType.JSON // 期望响应为 JSON 格式
    });

    if (!response.ok) {
      // API 返回了非 2xx 的状态码
      const errorData = response.data;
      const errorMessage = errorData?.error?.message |
| `HTTP 错误: ${response.status}`;
      setResult(null, errorMessage);
      return;
    }

    // --- 5. 解析结果并返回 ---
    const responseData = response.data;
    const translatedText = responseData?.choices?.?.message?.content?.trim();

    if (translatedText) {
      setResult(translatedText); // 成功，调用 setResult 返回结果
    } else {
      // 响应格式不符合预期
      setResult(null, '错误：API 返回了无效的响应数据。');
      utils.log(JSON.stringify(responseData)); // 在 Pot-App 日志中记录原始响应，便于调试
    }

  } catch (error) {
    // 捕获网络请求或其他意外错误
    utils.log(error); // 在 Pot-App 日志中记录详细错误
    setResult(null, `请求失败: ${error.message |
| '未知错误'}`);
  }
}
