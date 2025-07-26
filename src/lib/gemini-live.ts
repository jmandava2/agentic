
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

async function* audioStreamGenerator(mediaRecorder: MediaRecorder) {
  let resolve: (value: Blob) => void;
  let promise = new Promise<Blob>((r) => (resolve = r));

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      resolve(event.data);
      promise = new Promise<Blob>((r) => (resolve = r));
    }
  };

  while (mediaRecorder.state === 'recording') {
    const data = await promise;
    const reader = new FileReader();
    const readerPromise = new Promise<string>((res) => {
      reader.onload = () => res(reader.result as string);
    });
    reader.readAsDataURL(data);
    const base64 = (await readerPromise).split(',')[1];
    yield {
      audio: {
        mimeType: mediaRecorder.mimeType,
        data: base64,
      },
    };
  }
}

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
    try {
      this.apiKey = await this.getApiKey();
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const config = {
        responseModalities: [Modality.TEXT, Modality.AUDIO],
         safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      };
      
      const callbacks = {
          onopen: () => {
            this.options.onOpen();
            this.mediaRecorder = new MediaRecorder(this.mediaStream!, {
                mimeType: 'audio/webm;codecs=opus',
            });
            this.mediaRecorder.start(1000);
            this.streamAudio();
          },
          onmessage: (message: any) => {
            this.options.onMessage(message);
          },
          onerror: (error: any) => {
            this.options.onError(error);
          },
          onclose: (event: any) => {
            this.stopSession();
          }
      };

      this.session = await this.ai.live.connect({
        model: 'gemini-live-2.5-flash-preview',
        config: config,
        callbacks: callbacks
      });


    } catch (error) {
      this.options.onError(error);
      this.stopSession();
    }
  }

  private async streamAudio() {
    if (!this.mediaRecorder || !this.session) return;
    
    this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.session) {
            this.session.sendAudio({data: event.data});
        }
    };
  }

  public stopSession() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.session) {
      this.session.close();
    }
    if (this.isRunning) {
        this.options.onClose();
    }
    this.isRunning = false;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.session = null;
  }

  public async sendMessage(message: string) {
    console.warn("Sending text messages during an active audio stream is not yet implemented.", message);
  }
}
