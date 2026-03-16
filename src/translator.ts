import type { WhisperPluginSettings } from './settings';

export async function translate(
	text: string,
	settings: WhisperPluginSettings,
): Promise<string> {
	if (!settings.enableTranslation) return text;

	if (settings.translationProvider === 'openai') {
		return translateOpenAI(text, settings);
	} else {
		return translateDeepL(text, settings);
	}
}

async function translateOpenAI(
	text: string,
	settings: WhisperPluginSettings,
): Promise<string> {
	if (!settings.openAiApiKey) {
		throw new Error('OpenAI API key is required for OpenAI translation. Please add it in the plugin settings.');
	}

	const langName = settings.targetLanguage || 'English';

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${settings.openAiApiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content: `You are a translator. Translate the following text to ${langName}. Output only the translated text, nothing else.`,
				},
				{
					role: 'user',
					content: text,
				},
			],
			temperature: 0.2,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => response.statusText);
		throw new Error(`OpenAI translation error ${response.status}: ${errorText}`);
	}

	const data = await response.json() as {
		choices: { message: { content: string } }[];
	};

	return data.choices[0]?.message?.content?.trim() ?? text;
}

async function translateDeepL(
	text: string,
	settings: WhisperPluginSettings,
): Promise<string> {
	if (!settings.deepLApiKey) {
		throw new Error('DeepL API key is required for DeepL translation. Please add it in the plugin settings.');
	}

	// DeepL Free API uses api-free.deepl.com, Pro uses api.deepl.com
	const baseUrl = settings.deepLApiKey.endsWith(':fx')
		? 'https://api-free.deepl.com'
		: 'https://api.deepl.com';

	const body = new URLSearchParams({
		auth_key: settings.deepLApiKey,
		text,
		target_lang: settings.targetLanguage.toUpperCase(),
	});

	const response = await fetch(`${baseUrl}/v2/translate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => response.statusText);
		throw new Error(`DeepL error ${response.status}: ${errorText}`);
	}

	const data = await response.json() as {
		translations: { text: string }[];
	};

	return data.translations[0]?.text?.trim() ?? text;
}
