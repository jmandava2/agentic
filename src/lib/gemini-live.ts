'use client';

import { GoogleGenAI } from '@google/genai';

export type GeminiLiveApiOptions = {
  onMessage: (msg: any) => void;
  onError: (err: any) => void;
};

export class GeminiLiveApi {
  private ai?: GoogleGenAI;
  private session?: any; // Using any since types might not be fully exported
  private options: GeminiLiveApiOptions;
  private isConnected = false;
  private mediaRecorder?: MediaRecorder;
  private mediaStream?: MediaStream;

  constructor(opts: GeminiLiveaiOptions) {
    this.options = opts;
  }

  private getConfig() {
    return {
      responseModalities: ['TEXT', 'AUDIO'], // Using string literals instead of enum
      // Simplified config without advanced tools for now
    };
  }

  async startRecording() {
    if (this.session && this.isConnected) {
      console.warn("Already connected");
      return;
    }

    try {
      const res = await fetch('/api/gemini-api-key');
      if (!res.ok) throw new Error(`Failed to fetch API key: ${res.status}`);
      
      const { apiKey, error } = await res.json();
      if (error || !apiKey) throw new Error(error || 'API key not found');

      this.ai = new GoogleGenAI({ apiKey });

      // Check if live API is available
      if (!this.ai.live) {
        throw new Error('Gemini Live API not available in this version');
      }

      this.session = await this.ai.live.connect({
        model: 'gemini-2.0-flash-exp-0827',
        config: this.getConfig(),
        callbacks: {
          onopen: async () => {
            console.log('🔌 Gemini Live connected');
            this.isConnected = true;
            // Start streaming audio from the microphone
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.mediaStream);

            this.mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0 && this.session) {
                this.session.sendAudio(event.data);
              }
            };
            this.mediaRecorder.start(100); // Send audio chunks every 100ms
          },
          onmessage: (message: any) => {
            console.log('📨 Received:', message);
            this.options.onMessage(message);
          },
          onerror: (error: any) => {
            console.error('❌ Gemini Live error:', error);
            this.isConnected = false;
            this.options.onError(error);
          },
          onclose: (event: any) => {
            console.log('🔌 Gemini Live disconnected:', event?.reason || 'Unknown reason');
            this.isConnected = false;
            this.session = undefined;
            this.stopRecording();
          },
        },
      });

    } catch (error) {
      console.error('Failed to start Gemini Live:', error);
      this.options.onError(error);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.session) {
      this.session.close();
      this.session = undefined;
      this.isConnected = false;
    }
  }

  sendMessage(text: string) {
    if (!this.session || !this.isConnected) {
      console.warn('Not connected to Gemini Live');
      return;
    }
    
    console.log('👤 Sending:', text);
    this.session.sendClientContent({ turns: text });
  }

  disconnect() {
    this.stopRecording();
  }
}
