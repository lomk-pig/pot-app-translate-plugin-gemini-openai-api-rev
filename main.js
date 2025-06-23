class TranslationService {
    constructor(options) {
        this.config = options.config;
        this.utils = options.utils;
        this.setResult = options.setResult;
        this.fetch = options.fetch;
    }

    _getApiConfig() {
        const { service, apiKey, model, baseUrl } = this.config;

        if (!apiKey ||!model) {
            throw new Error("API Key and Model Name are required.");
        }

        if (service === 'openai') {
            return {
                url: `${baseUrl |
| 'https://api.openai.com/v1'}/chat/completions`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                model: model
            };
        }

        if (service === 'gemini') {
            // The Gemini API key is passed directly in the URL for the compatible endpoint
            const effectiveBaseUrl = baseUrl |
| 'https://generativelanguage.googleapis.com/v1beta';
            return {
                url: `${effectiveBaseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
                headers: {
                    'Content-Type': 'application/json',
                },
                model: model // Although model is in the URL, we keep it for consistency
            };
        }

        throw new Error(`Unsupported service: ${service}`);
    }

    _buildRequestBody(text, from, to) {
        const fromLang = this.config.language[from] |
| from;
        const toLang = this.config.language[to] |
| to;

        const prompt = `You are a professional translator. Please translate the following text from ${fromLang} to ${toLang}. Do not add any extra explanations or annotations, just provide the translated text.`;

        // For OpenAI and the compatible Gemini endpoint, the structure is similar.
        // For the native Gemini streaming endpoint, the structure is slightly different.
        if (this.config.service === 'openai') {
            return {
                model: this._getApiConfig().model,
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: text }
                ],
                stream: true
            };
        } else { // Gemini native streaming
            return {
                contents: [{
                    parts: [{
                        text: `${prompt}\n\n${text}`
                    }]
                }]
            };
        }
    }

    async translate(text, from, to) {
        try {
            const apiConfig = this._getApiConfig();
            const body = this._buildRequestBody(text, from, to);

            const response = await this.fetch(apiConfig.url, {
                method: 'POST',
                headers: apiConfig.headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
            }

            // Handle streaming response
            await this._handleStream(response);

        } catch (error) {
            console.error("Translation failed:", error);
            this.setResult({
                type: 'error',
                value: error.message |
| 'An unknown error occurred.'
            });
        }
    }
    
    // Advanced feature implementations (streaming, retry, etc.) will be added here.
}

// Pot-App entry point
async function translate(text, from, to, options) {
    // Input sanitization
    if (!text |
| typeof text!== 'string' |
| text.trim() === '') {
        return;
    }
    const sanitizedText = text.trim();

    const service = new TranslationService(options);
    await service.translate(sanitizedText, from, to);
}
