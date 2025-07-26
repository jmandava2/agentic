
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
  private responseQueue: any[] = [];
  private isConnected = false;

  constructor(opts: GeminiLiveApiOptions) {
    this.options = opts;
  }

  private getFunctionDeclarations() {
    return [
      {
        name: 'turn_on_the_lights',
        description: 'Turn on the lights in the room',
        parameters: {
          type: 'object',
          properties: {
            room: {
              type: 'string',
              description: 'The room to turn on lights in'
            }
          },
        },
        behavior: Behavior.NON_BLOCKING,
      },
      {
        name: 'turn_off_the_lights',
        description: 'Turn off the lights in the room',
        parameters: {
          type: 'object',
          properties: {
            room: {
              type: 'string',
              description: 'The room to turn off lights in'
            }
          },
        },
      },
      {
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City and state/country'
            }
          },
          required: ['location'],
        },
      },
    ];
  }

  private getConfig() {
    return {
      responseModalities: [Modality.TEXT, Modality.AUDIO],
      tools: [
        { functionDeclarations: this.getFunctionDeclarations() },
        { googleSearch: {} },
        { codeExecution: {} },
      ],
    };
  }

  async startSession() {
    if (this.session && this.isConnected) {
      console.warn("Already connected");
      return;
    }

    try {
      this.options.onOpen();
      const res = await fetch('/api/gemini-api-key');
      if (!res.ok) throw new Error(`Failed to fetch API key: ${res.status}`);
      
      const { apiKey, error } = await res.json();
      if (error || !apiKey) throw new Error(error || 'API key not found');

      this.ai = new GoogleGenAI({ apiKey });

      this.session = await this.ai.live.connect({
        model: 'gemini-2.0-flash-live-001',
        config: this.getConfig(),
        callbacks: {
          onopen: () => {
            console.log('🔌 Gemini Live connected');
            this.isConnected = true;
          },
          onmessage: (message) => {
            this.responseQueue.push(message);
            this.options.onMessage(message);
            
            if (message.toolCall?.functionCalls?.length) {
              this.handleFunctionCalls(message.toolCall.functionCalls);
            }
          },
          onerror: (error) => {
            console.error('❌ Gemini Live error:', error);
            this.isConnected = false;
            this.options.onError(error);
          },
          onclose: (event) => {
            console.log('🔌 Gemini Live disconnected:', event.reason);
            this.isConnected = false;
            this.session = undefined;
            this.options.onClose();
          },
        },
      });

    } catch (error) {
      console.error('Failed to start Gemini Live:', error);
      this.options.onError(error);
    }
  }

  stopSession() {
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
    
    this.session.sendClientContent({ text });
  }

  private async handleFunctionCalls(functionCalls: FunctionCall[]) {
    const functionResponses = await Promise.all(
      functionCalls.map(async (fc) => {
        let result;
        
        switch (fc.name) {
          case 'turn_on_the_lights':
            result = { status: "success", message: `Lights turned on in ${fc.args?.room}` };
            break;
          case 'turn_off_the_lights':
            result = { status: "success", message: `Lights turned off in ${fc.args?.room}` };
            break;
          case 'get_weather':
            result = { location: fc.args?.location, temp: "22°C", condition: "Sunny" };
            break;
          default:
            result = { error: `Unknown function: ${fc.name}` };
        }

        return {
          id: fc.id,
          name: fc.name,
          response: {
            result,
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        };
      })
    );

    if (this.session && this.isConnected) {
      const toolResponse: ToolResponse = { functionResponses };
      this.session.sendToolResponse(toolResponse);
    }
  }

  disconnect() {
    this.stopSession();
  }
}
