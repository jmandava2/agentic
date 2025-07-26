
'use client';

import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  Part,
} from '@google/genai';

export type GeminiLiveApiOptions = {
  onMessage: (message: any) => void;
  onError: (error: any) => void;
  onClose: () => void;
  onOpen: () => void;
};

async function* audioStreamGenerator(
  mediaRecorder: MediaRecorder
): AsyncGenerator<Part> {
  let audioDataQueue: Blob[] = [];
  let resolveAudioData: ((value: void) => void) | null = null;

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioDataQueue.push(event.data);
      if (resolveAudioData) {
        resolveAudioData();
        resolveAudioData = null;
      }
    }
  };

  while (mediaRecorder.state === 'recording' || audioDataQueue.length > 0) {
    if (audioDataQueue.length > 0) {
      const blob = audioDataQueue.shift()!;
      const audioData = await blob.arrayBuffer();
      yield {
        inlineData: {
          data: Buffer.from(audioData).toString('base64'),
          mimeType: mediaRecorder.mimeType,
        },
      };
    } else {
      await new Promise<void>((resolve) => {
        resolveAudioData = resolve;
      });
    }
  }
}

export class GeminiLiveApi {
  private ai: GoogleGenAI | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private apiKey: string | null = null;
  private options: GeminiLiveApiOptions;
  private isRunning: boolean = false;
  private stopController: AbortController | null = null;

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
    this.stopController = new AbortController();
    this.options.onOpen();

    try {
      this.apiKey = await this.getApiKey();
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      this.mediaRecorder.start(1000);

      const model = this.ai.getGenerativeModel({
        model: 'models/gemini-1.5-flash-latest',
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      });

      const stream = audioStreamGenerator(this.mediaRecorder);
      const { stream: responseStream } = await model.generateContent({
        contents: stream,
      });

      for await (const chunk of responseStream) {
        if (this.stopController.signal.aborted) {
          break;
        }

        const text = chunk.text?.();
        const audioPart = chunk.candidates?.[0]?.content?.parts?.find(
          (part) => part.audio
        );

        if (text || audioPart) {
          this.options.onMessage({
            text: text,
            audio: audioPart?.audio,
          });
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        this.options.onError(error);
      }
    } finally {
      this.stopSession();
    }
  }

  public stopSession() {
    if (!this.isRunning) return;

    this.stopController?.abort();

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    this.isRunning = false;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.stopController = null;
    this.options.onClose();
  }
}
