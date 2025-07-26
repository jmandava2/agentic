
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
  private session: any = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private apiKey: string | null = null;
  private options: GeminiLiveApiOptions;

  constructor(options: GeminiLiveApiOptions) {
    this.options = options;
  }

  private async getApiKey(): Promise<string> {
    const res = await fetch('/api/gemini-api-key');
    if (!res.ok) {
      throw new Error(`Failed to fetch API key: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (data.error || !data.apiKey) {
      throw new Error(data.error || 'API key not found.');
    }
    return data.apiKey;
  }

  public async startSession() {
    if (this.session) {
      console.warn('Session already in progress.');
      return;
    }
    try {
      this.apiKey = await this.getApiKey();
      this.ai = new GoogleGenAI(this.apiKey);
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.session = await this.ai.getGenerativeModel({
          model: 'gemini-1.5-flash-latest',
        }).startChat({
        history: [],
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
        // @ts-ignore - This is a valid parameter for voice but not yet in the types
        requestModalities: [Modality.AUDIO, Modality.TEXT],
        responseModalities: [Modality.AUDIO, Modality.TEXT],
      });

      this.options.onOpen();

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.session) {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const result = await this.session.sendMessageStream([
                {
                  audio: {
                    mimeType: this.mediaRecorder!.mimeType,
                    data: (reader.result as string).split(',')[1],
                  },
                },
              ]);

              for await (const chunk of result.stream) {
                this.options.onMessage(chunk);
              }
            } catch (error) {
              this.options.onError(error);
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Send data every 1s
    } catch (error) {
      this.options.onError(error);
    }
  }

  public stopSession() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    this.session = null;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.options.onClose();
  }

  public async sendMessage(message: string) {
     if (!this.session) {
        this.options.onError(new Error('Session not started.'));
        return;
    }
    try {
        const result = await this.session.sendMessageStream(message);
        for await (const chunk of result.stream) {
            this.options.onMessage(chunk);
        }
    } catch (error) {
        this.options.onError(error);
    }
  }
}
