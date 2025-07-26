'use client';

import { GoogleGenAI } from '@google/genai';

export type GeminiLiveApiOptions = {
  onMessage: (msg: any) => void;
  onError: (err: any) => void;
};

export class GeminiLiveApi {
  private ai?: GoogleGenAI;
  private session?: any;
  private options: GeminiLiveApiOptions;
  private isConnected = false;
  private mediaRecorder?: MediaRecorder;
  private mediaStream?: MediaStream;

  constructor(opts: GeminiLiveApiOptions) {
    this.options = opts;
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

      // Connect to Gemini Live API with proper structure
      this.session = await this.ai.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: ['TEXT', 'AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
          }
        },
        systemInstruction: 'You are a helpful farming assistant. Provide concise, practical advice.',
      });

      // Set up event handlers after connection
      this.session.onopen = async () => {
        console.log('Gemini Live connected');
        this.isConnected = true;
        
        try {
          // Start streaming audio from the microphone
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.mediaRecorder = new MediaRecorder(this.mediaStream, {
            mimeType: 'audio/webm;codecs=opus'
          });

          this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && this.session && this.isConnected) {
              try {
                // Convert blob to base64 for sending
                const arrayBuffer = await event.data.arrayBuffer();
                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                
                // Send audio data to Gemini Live
                this.session.send({
                  clientContent: {
                    turns: [{
                      role: 'user',
                      parts: [{
                        inlineData: {
                          mimeType: 'audio/webm;codecs=opus',
                          data: base64Audio
                        }
                      }]
                    }]
                  }
                });
              } catch (error) {
                console.error('Error sending audio data:', error);
                this.options.onError(error);
              }
            }
          };
          
          this.mediaRecorder.start(250); // Send audio chunks every 250ms
        } catch (micError) {
          console.error('Microphone access error:', micError);
          this.options.onError(micError);
        }
      };
      
      this.session.onmessage = (message: any) => {
        console.log('Received:', message);
        this.options.onMessage(message);
      };
      
      this.session.onerror = (error: any) => {
        console.error('Gemini Live error:', error);
        this.isConnected = false;
        this.options.onError(error);
      };
      
      this.session.onclose = (event: any) => {
        console.log('Gemini Live disconnected:', event?.reason || 'Unknown reason');
        this.isConnected = false;
        this.session = undefined;
        this.stopRecording();
      };

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
    
    console.log('Sending:', text);
    try {
      this.session.send({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text }]
          }]
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      this.options.onError(error);
    }
  }

  disconnect() {
    this.stopRecording();
  }
}