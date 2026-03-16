import { AudioRecorder } from './recorder';
import type { WhisperPluginSettings } from './settings';

export interface TranscriptionResult {
	text: string;
	detectedLanguage?: string;
}

/**
 * Sends the audio blob to the local Python sidecar (FastAPI + whisper).
 */
export async function transcribe(
	blob: Blob,
	mimeType: string,
	settings: WhisperPluginSettings,
): Promise<TranscriptionResult> {
	const ext = AudioRecorder.extensionForMime(mimeType);
	const filename = `recording.${ext}`;

	const formData = new FormData();
	formData.append('file', blob, filename);
	formData.append('model', settings.whisperModel);

	if (settings.sourceLanguage) {
		formData.append('language', settings.sourceLanguage);
	}

	const url = `${settings.sidecarUrl.replace(/\/$/, '')}/transcribe`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			body: formData,
		});
	} catch (err) {
		throw new Error(
			`Cannot reach sidecar at ${url}. Make sure the Python server is running (python sidecar/server.py). ` +
			`Error: ${(err as Error).message}`
		);
	}

	if (!response.ok) {
		const errorText = await response.text().catch(() => response.statusText);
		throw new Error(`Sidecar returned error ${response.status}: ${errorText}`);
	}

	const data = await response.json() as { text: string; language?: string };
	return {
		text: data.text.trim(),
		detectedLanguage: data.language,
	};
}
