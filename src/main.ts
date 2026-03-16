import { Plugin, Notice, addIcon } from 'obsidian';
import { AudioRecorder } from './recorder';
import { transcribe } from './transcriber';
import { translate } from './translator';
import { insertText } from './inserter';
import { WhisperSettingTab, WhisperPluginSettings, DEFAULT_SETTINGS } from './settings';

const MIC_ICON_ID = 'whisper-mic';
const MIC_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`;

const MIC_STOP_ICON_ID = 'whisper-mic-stop';
const MIC_STOP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor" opacity="0.3"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
  <line x1="1" y1="1" x2="23" y2="23" stroke="red" stroke-width="2.5"/>
</svg>`;

export default class WhisperPlugin extends Plugin {
	settings: WhisperPluginSettings;
	private recorder = new AudioRecorder();
	private ribbonIcon: HTMLElement | null = null;
	private statusBarItem: HTMLElement | null = null;
	private recordingTimer: ReturnType<typeof setInterval> | null = null;
	private recordingSeconds = 0;

	async onload() {
		await this.loadSettings();

		addIcon(MIC_ICON_ID, MIC_ICON_SVG);
		addIcon(MIC_STOP_ICON_ID, MIC_STOP_ICON_SVG);

		// Ribbon icon
		this.ribbonIcon = this.addRibbonIcon(
			MIC_ICON_ID,
			'Start / Stop transcription recording',
			() => this.toggleRecording(),
		);

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('whisper-status');
		this.updateStatusBar('idle');

		// Commands
		this.addCommand({
			id: 'start-recording',
			name: 'Start recording',
			callback: () => this.startRecording(),
		});

		this.addCommand({
			id: 'stop-recording',
			name: 'Stop recording and transcribe',
			callback: () => this.stopRecording(),
		});

		this.addCommand({
			id: 'cancel-recording',
			name: 'Cancel recording',
			callback: () => this.cancelRecording(),
		});

		// Settings tab
		this.addSettingTab(new WhisperSettingTab(this.app, this));

		// Recorder state changes drive UI updates
		this.recorder.onStateChange = (state) => {
			this.updateStatusBar(state);
			this.updateRibbonIcon(state);
		};
	}

	onunload() {
		this.recorder.cancel();
		this.clearTimer();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private toggleRecording() {
		if (this.recorder.state === 'idle') {
			this.startRecording();
		} else if (this.recorder.state === 'recording') {
			this.stopRecording();
		}
	}

	private async startRecording() {
		if (this.recorder.state !== 'idle') {
			new Notice('Already recording.');
			return;
		}

		try {
			const maxMs = this.settings.maxRecordingSeconds > 0
				? this.settings.maxRecordingSeconds * 1000
				: 0;
			await this.recorder.start(maxMs);
			this.startTimer();
			new Notice('Recording started. Click the mic icon or run "Stop recording" to finish.');
		} catch (err) {
			new Notice(`Could not start recording: ${(err as Error).message}`);
		}
	}

	private async stopRecording() {
		if (this.recorder.state !== 'recording') {
			new Notice('No active recording.');
			return;
		}

		this.clearTimer();

		let result;
		try {
			result = await this.recorder.stop();
		} catch (err) {
			new Notice(`Recording stopped with an error: ${(err as Error).message}`);
			return;
		}

		new Notice('Transcribing…');

		try {
			const { text } = await transcribe(result.blob, result.mimeType, this.settings);

			let finalText = text;
			if (this.settings.enableTranslation) {
				new Notice('Translating…');
				finalText = await translate(text, this.settings);
			}

			insertText(this.app, finalText, this.settings.outputFormat);
			new Notice('Transcription inserted.');
		} catch (err) {
			new Notice(`Transcription failed: ${(err as Error).message}`);
		}
	}

	private cancelRecording() {
		if (this.recorder.state === 'idle') {
			new Notice('No active recording to cancel.');
			return;
		}
		this.clearTimer();
		this.recorder.cancel();
		new Notice('Recording cancelled.');
	}

	private startTimer() {
		this.recordingSeconds = 0;
		this.recordingTimer = setInterval(() => {
			this.recordingSeconds++;
			this.updateStatusBar('recording');
		}, 1000);
	}

	private clearTimer() {
		if (this.recordingTimer !== null) {
			clearInterval(this.recordingTimer);
			this.recordingTimer = null;
		}
	}

	private updateStatusBar(state: string) {
		if (!this.statusBarItem) return;

		switch (state) {
			case 'recording': {
				const mins = Math.floor(this.recordingSeconds / 60).toString().padStart(2, '0');
				const secs = (this.recordingSeconds % 60).toString().padStart(2, '0');
				this.statusBarItem.setText(`🔴 Recording ${mins}:${secs}`);
				break;
			}
			case 'processing':
				this.statusBarItem.setText('⏳ Transcribing…');
				break;
			default:
				this.statusBarItem.setText('');
				break;
		}
	}

	private updateRibbonIcon(state: string) {
		if (!this.ribbonIcon) return;

		if (state === 'recording') {
			this.ribbonIcon.setAttribute('aria-label', 'Stop recording');
			this.ribbonIcon.addClass('whisper-recording');
		} else {
			this.ribbonIcon.setAttribute('aria-label', 'Start transcription recording');
			this.ribbonIcon.removeClass('whisper-recording');
		}
	}
}
