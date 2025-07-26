
'use client';

import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  Modality,
} from '@google/genai';

export type GeminiLiveApiOptions = {
  onMessage: (message: any) => void;
  onError: (error: any) => void;
  onClose: () => void;
  onOpen: () => void;
};

export class GeminiLiveApi {
  private ai: GoogleGenAI | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private apiKey: string | null = null;
  private options: GeminiLiveApiOptions;
  private isRunning: boolean = false;
  private session: any = null;

  constructor(options: GeminiLiveApiOptions) {
    this.options = options;
  }

  private async getApiKey(): Promise<string> {
    const res = await fetch('/api/gemini-api-key');
    if (!res.ok) {
      throw new Error(
        `Failed to fetch API key: ${res.status} ${res.statusText}`
      );
    }
    const data = await res.json();
    if (data.error || !data.apiKey) {
      throw new Error(data.error || 'API key not found.');
    }
    return data.apiKey;
  }

  public async startSession() {
    if (this.isRunning) {
      console.warn('Session already in progress.');
      return;
    }
    this.isRunning = true;
    this.options.onOpen();

    try {
      this.apiKey = await this.getApiKey();
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.session = await this.ai.live.connect({
        model: 'models/gemini-live-2.5-flash-preview',
        config: {
          responseModalities: [Modality.TEXT, Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            this.mediaRecorder = new MediaRecorder(this.mediaStream!, {
              mimeType: 'audio/webm;codecs=opus',
            });

            this.mediaRecorder.ondataavailable = async (event) => {
              if (event.data.size > 0 && this.session) {
                const audioData = await event.data.arrayBuffer();
                this.session.sendAudio({
                  audio: new Uint8Array(audioData),
                });
              }
            };
            this.mediaRecorder.start(1000); // Send data every 1 second
          },
          onmessage: (message: any) => {
            this.options.onMessage(message);
          },
          onerror: (error: any) => {
            this.options.onError(error);
            this.stopSession();
          },
          onclose: () => {
            this.stopSession();
          },
        },
      });
    } catch (error) {
      this.options.onError(error);
      this.stopSession();
    }
  }

  public stopSession() {
    if (!this.isRunning) return;

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.session) {
      this.session.close();
    }

    this.isRunning = false;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.session = null;
    this.options.onClose();
  }
}
