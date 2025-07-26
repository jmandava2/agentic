// A client for the Gemini voice-to-voice API.
// This is a proof-of-concept and not a production-ready client.
// To use this, you will need to authenticate with Google Cloud and have the
// necessary permissions to use the Gemini API.

const WEBSOCKET_URL_BASE =
  'wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent';

export type GeminiLiveApiOptions = {
  onMessage: (message: any) => void;
  onError: (error: any) => void;
};

export class GeminiLiveApi {
  private websocket: WebSocket | null = null;
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

  public async startRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        console.warn("Recording is already in progress.");
        return;
    }

    try {
        this.apiKey = await this.getApiKey();
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const wsUrl = `${WEBSOCKET_URL_BASE}?key=${this.apiKey}&response_mime_type=audio/opus`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
            console.log('WebSocket connected. Sending initial configuration.');
            // Send the initial configuration message once connected.
            const initialConfig = {
              model: 'models/gemini-1.5-flash-latest',
              audio_config: {
                audio_encoding: 'WEBM_OPUS',
                sample_rate: 16000,
              },
            };
            this.websocket!.send(JSON.stringify(initialConfig));

            // Start the media recorder after the connection is open and configured
            this.mediaRecorder = new MediaRecorder(this.mediaStream!, {
              mimeType: 'audio/webm;codecs=opus',
            });

            this.mediaRecorder.ondataavailable = (event) => {
              if (
                event.data.size > 0 &&
                this.websocket &&
                this.websocket.readyState === WebSocket.OPEN
              ) {
                const reader = new FileReader();
                reader.onload = () => {
                  this.websocket!.send(
                    JSON.stringify({
                      audio: (reader.result as string).split(',')[1],
                    })
                  );
                };
                reader.readAsDataURL(event.data);
              }
            };

            this.mediaRecorder.start(200); // Send data every 200ms
        };

        this.websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.options.onMessage(message);
        };

        this.websocket.onclose = () => {
            console.log('WebSocket disconnected.');
            this.websocket = null;
        };

        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.options.onError(error);
        };

    } catch (error) {
        console.error("Failed to start recording:", error);
        this.options.onError(error);
    }
  }


  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close();
    }
  }

  public sendMessage(message: string) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(
        JSON.stringify({
          parts: [{ text: message }],
        })
      );
    }
  }

  public disconnect() {
    this.stopRecording();
  }
}
