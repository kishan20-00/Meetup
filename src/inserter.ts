import { Editor, MarkdownView, App, moment } from 'obsidian';
import type { OutputFormat } from './settings';

export function insertText(
	app: App,
	text: string,
	format: OutputFormat,
): void {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		throw new Error('No active Markdown note. Please open a note before recording.');
	}

	const editor = view.editor;
	const formatted = formatOutput(text, format);
	editor.replaceSelection(formatted);
}

function formatOutput(text: string, format: OutputFormat): string {
	switch (format) {
		case 'callout':
			return `> [!note] Transcription\n> ${text.replace(/\n/g, '\n> ')}\n`;

		case 'timestamp': {
			const ts = moment().format('YYYY-MM-DD HH:mm:ss');
			return `### Transcription — ${ts}\n\n${text}\n`;
		}

		case 'plain':
		default:
			return text;
	}
}
