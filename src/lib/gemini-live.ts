
'use client';

import {
  GoogleGenAI,
  Modality,
  Behavior,
  FunctionResponseScheduling,
  LiveSession,
  ToolResponse,
  FunctionCall,
} from '@google/genai';
import { MediaRecorder, IMediaRecorder } from 'extendable-media-recorder';


export type GeminiLiveApiOptions = {
  onMessage: (msg: any) => void;
  onError: (err: any) => void;
  onClose: () => void;
  onOpen: () => void;
};

export class GeminiLiveApi {
  private ai?: GoogleGenAI;
  private session?: LiveSession;
  private options: GeminiLiveApiOptions;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: IMediaRecorder | null = null;
  private responseQueue: any[] = [];
  private isRunning: boolean = false;


  constructor(opts: GeminiLiveApiOptions) {
    this.options = opts;
  }

  /* ---------- private helpers ---------- */
  private fnDeclarations() {
    return [
      {
        name: 'turn_on_the_lights',
        description: 'Turn on the lights in the room',
        parameters: {
          type: 'object',
          properties: { room: { type: 'string' } },
        },
        behavior: Behavior.NON_BLOCKING,
      },
      {
        name: 'turn_off_the_lights',
        description: 'Turn off the lights in the room',
        parameters: {
          type: 'object',
          properties: { room: { type: 'string' } },
        },
      },
      {
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
    ];
  }

  private cfg() {
    return {
      responseModalities: [Modality.TEXT, Modality.AUDIO],
      tools: [
        { functionDeclarations: this.fnDeclarations() },
        { googleSearch: {} },
        { codeExecution: {} },
      ],
    };
  }

  /* ---------- public API ---------- */
  async startSession() {
    if (this.session || this.isRunning) return;
    this.isRunning = true;
    this.options.onOpen();

    const { apiKey } = await fetch('/api/gemini-api-key').then((r) => r.json());
    if (!apiKey) {
      this.options.onError(new Error('API key missing'));
      this.isRunning = false;
      return;
    }

    this.ai = new GoogleGenAI({ apiKey });
    
    try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        this.session = await this.ai.live.connect({
        model: 'gemini-2.0-flash-live-001',
        config: this.cfg(),
        callbacks: {
            onopen: () => {
                this.mediaRecorder = new MediaRecorder(this.mediaStream!, {
                    mimeType: 'audio/webm;codecs=opus',
                });
                
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0 && this.session) {
                       this.session.sendAudio({ audio: new Uint8Array(event.data) });
                    }
                };
                this.mediaRecorder.start(1000); // Send data every second
            },
            onmessage: (m) => {
                this.responseQueue.push(m);
                this.options.onMessage(m);
            },
            onerror: (err) => {
                this.options.onError(err);
                this.stopSession();
            },
            onclose: () => this.stopSession(),
        },
        });
    } catch (error) {
        this.options.onError(error);
        this.stopSession();
    }
  }

  public stopSession() {
    if (!this.isRunning) return;

    this.session?.close();
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    this.session = undefined;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.isRunning = false;
    this.options.onClose();
  }

  sendMessage(text: string) {
    if (!this.session) return;
    this.session.sendClientContent({ text });
  }

  /* optional: automatic function-response handler */
  async listenForCalls() {
    while (this.session) {
      const msg = this.responseQueue.shift();
      if (msg?.toolCall?.functionCalls?.length) {
        const fns = await this.processFnCalls(msg.toolCall.functionCalls);
        const resp: ToolResponse = { functionResponses: fns };
        this.session.sendToolResponse(resp);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async processFnCalls(calls: FunctionCall[]) {
    const out = [];
    for (const c of calls) {
      let result;
      switch (c.name) {
        case 'turn_on_the_lights':
          result = { status: 'ok', message: `Lights on in ${c.args?.room}` };
          break;
        case 'turn_off_the_lights':
          result = { status: 'ok', message: `Lights off in ${c.args?.room}` };
          break;
        case 'get_weather':
          result = { location: c.args?.location, temp: '22 °C', condition: 'Sunny' };
          break;
        default:
          result = { error: 'unknown function' };
      }
      out.push({
        id: c.id,
        name: c.name,
        response: { result, scheduling: FunctionResponseScheduling.INTERRUPT },
      });
    }
    return out;
  }
}
