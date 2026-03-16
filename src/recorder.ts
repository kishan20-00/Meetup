export type RecorderState = 'idle' | 'recording' | 'processing';

export interface RecordingResult {
	blob: Blob;
	mimeType: string;
	durationMs: number;
}

export class AudioRecorder {
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private startTime = 0;
	private stopTimeout: ReturnType<typeof setTimeout> | null = null;

	state: RecorderState = 'idle';

	onStateChange?: (state: RecorderState) => void;

	private setState(state: RecorderState) {
		this.state = state;
		this.onStateChange?.(state);
	}

	async start(maxDurationMs = 0): Promise<void> {
		if (this.state !== 'idle') {
			throw new Error('Recorder is already active');
		}

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
		} catch (err) {
			throw new Error(`Microphone access denied: ${(err as Error).message}`);
		}

		// Pick the best supported MIME type. WebM is accepted by OpenAI Whisper API.
		const mimeType = this.getSupportedMimeType();

		this.chunks = [];
		this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

		this.mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				this.chunks.push(e.data);
			}
		};

		this.mediaRecorder.start(250); // collect data every 250ms
		this.startTime = Date.now();
		this.setState('recording');

		if (maxDurationMs > 0) {
			this.stopTimeout = setTimeout(() => this.stop(), maxDurationMs);
		}
	}

	stop(): Promise<RecordingResult> {
		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder || this.state !== 'recording') {
				reject(new Error('No active recording'));
				return;
			}

			if (this.stopTimeout !== null) {
				clearTimeout(this.stopTimeout);
				this.stopTimeout = null;
			}

			const durationMs = Date.now() - this.startTime;
			const mimeType = this.mediaRecorder.mimeType || 'audio/webm';

			this.mediaRecorder.onstop = () => {
				const blob = new Blob(this.chunks, { type: mimeType });
				this.chunks = [];
				this.stopMediaTracks();
				this.mediaRecorder = null;
				this.setState('idle');
				resolve({ blob, mimeType, durationMs });
			};

			this.mediaRecorder.onerror = (e) => {
				this.stopMediaTracks();
				this.mediaRecorder = null;
				this.setState('idle');
				reject(new Error(`Recording error: ${e}`));
			};

			this.setState('processing');
			this.mediaRecorder.stop();
		});
	}

	cancel(): void {
		if (!this.mediaRecorder) return;

		if (this.stopTimeout !== null) {
			clearTimeout(this.stopTimeout);
			this.stopTimeout = null;
		}

		this.mediaRecorder.onstop = null;
		this.mediaRecorder.onerror = null;

		if (this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder.stop();
		}

		this.chunks = [];
		this.stopMediaTracks();
		this.mediaRecorder = null;
		this.setState('idle');
	}

	private stopMediaTracks() {
		if (!this.mediaRecorder) return;
		const stream = this.mediaRecorder.stream;
		if (stream) {
			stream.getTracks().forEach(track => track.stop());
		}
	}

	private getSupportedMimeType(): string {
		const candidates = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/ogg;codecs=opus',
			'audio/mp4',
		];
		for (const type of candidates) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}
		return '';
	}

	/** Returns a filename extension appropriate for the recorded MIME type */
	static extensionForMime(mimeType: string): string {
		if (mimeType.startsWith('audio/webm')) return 'webm';
		if (mimeType.startsWith('audio/ogg')) return 'ogg';
		if (mimeType.startsWith('audio/mp4')) return 'mp4';
		return 'webm';
	}
}
