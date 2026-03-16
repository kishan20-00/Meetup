import { App, PluginSettingTab, Setting } from 'obsidian';
import type WhisperPlugin from './main';

export type OutputFormat = 'plain' | 'callout' | 'timestamp';
export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';

export interface WhisperPluginSettings {
	sidecarUrl: string;
	whisperModel: WhisperModel;
	sourceLanguage: string;
	outputFormat: OutputFormat;
	maxRecordingSeconds: number;
}

export const DEFAULT_SETTINGS: WhisperPluginSettings = {
	sidecarUrl: 'http://localhost:8000',
	whisperModel: 'base',
	sourceLanguage: '',
	outputFormat: 'plain',
	maxRecordingSeconds: 300,
};

const LANGUAGES: Record<string, string> = {
	'': 'Auto-detect',
	'en': 'English',
	'es': 'Spanish',
	'fr': 'French',
	'de': 'German',
	'it': 'Italian',
	'pt': 'Portuguese',
	'nl': 'Dutch',
	'pl': 'Polish',
	'ru': 'Russian',
	'ja': 'Japanese',
	'ko': 'Korean',
	'zh': 'Chinese',
	'ar': 'Arabic',
	'tr': 'Turkish',
	'sv': 'Swedish',
	'da': 'Danish',
	'fi': 'Finnish',
	'no': 'Norwegian',
	'cs': 'Czech',
	'uk': 'Ukrainian',
};

export class WhisperSettingTab extends PluginSettingTab {
	plugin: WhisperPlugin;

	constructor(app: App, plugin: WhisperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Whisper Transcription Settings' });

		// --- Sidecar ---
		containerEl.createEl('h3', { text: 'Python Sidecar' });

		containerEl.createEl('p', {
			text: 'Transcription runs locally via a Python sidecar. Start it with: python sidecar/server.py',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Sidecar URL')
			.setDesc('URL of the running Python FastAPI sidecar.')
			.addText(text => text
				.setPlaceholder('http://localhost:8000')
				.setValue(this.plugin.settings.sidecarUrl)
				.onChange(async (value) => {
					this.plugin.settings.sidecarUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Whisper model')
			.setDesc('Larger models are more accurate but slower. base or small is recommended for most users.')
			.addDropdown(drop => drop
				.addOption('tiny',     'tiny (~75 MB) — very fast, lower accuracy')
				.addOption('base',     'base (~145 MB) — fast, good for everyday use')
				.addOption('small',    'small (~465 MB) — balanced')
				.addOption('medium',   'medium (~1.5 GB) — high accuracy, slow')
				.addOption('large-v3', 'large-v3 (~3 GB) — best accuracy, very slow')
				.setValue(this.plugin.settings.whisperModel)
				.onChange(async (value) => {
					this.plugin.settings.whisperModel = value as WhisperModel;
					await this.plugin.saveSettings();
				}));

		// --- Language ---
		containerEl.createEl('h3', { text: 'Language' });

		new Setting(containerEl)
			.setName('Source language')
			.setDesc('Language spoken in the recording. Use Auto-detect if unsure.')
			.addDropdown(drop => {
				for (const [code, name] of Object.entries(LANGUAGES)) {
					drop.addOption(code, name);
				}
				return drop
					.setValue(this.plugin.settings.sourceLanguage)
					.onChange(async (value) => {
						this.plugin.settings.sourceLanguage = value;
						await this.plugin.saveSettings();
					});
			});

		// --- Output ---
		containerEl.createEl('h3', { text: 'Output' });

		new Setting(containerEl)
			.setName('Output format')
			.setDesc('How to insert the transcribed text into your note.')
			.addDropdown(drop => drop
				.addOption('plain', 'Plain text')
				.addOption('callout', 'Callout block')
				.addOption('timestamp', 'With timestamp header')
				.setValue(this.plugin.settings.outputFormat)
				.onChange(async (value) => {
					this.plugin.settings.outputFormat = value as OutputFormat;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max recording duration (seconds)')
			.setDesc('Maximum length of a single recording. 0 = unlimited.')
			.addSlider(slider => slider
				.setLimits(0, 600, 30)
				.setValue(this.plugin.settings.maxRecordingSeconds)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxRecordingSeconds = value;
					await this.plugin.saveSettings();
				}));
	}
}
