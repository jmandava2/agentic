// A client for the Gemini voice-to-voice API.
// This is a proof-of-concept and not a production-ready client.
// To use this, you will need to authenticate with Google Cloud and have the
// necessary permissions to use the Gemini API.

const WEBSOCKET_URL_BASE =
  "wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent";

export type GeminiLiveApiOptions = {
    onMessage: (message: any) => void,
    onError: (error: any) => void,
}

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
        // In a real app, you would fetch this from a secure backend.
        // For this demo, we'll fetch it from a local endpoint.
        const res = await fetch('/api/gemini-api-key');
        const data = await res.json();
        if (data.error || !data.apiKey) {
            throw new Error(data.error || 'API key not found.');
        }
        return data.apiKey;
    }

    public async connect() {
        if (this.websocket) {
            return;
        }

        try {
            this.apiKey = await this.getApiKey();
            
            const wsUrl = `${WEBSOCKET_URL_BASE}?key=${this.apiKey}&response_mime_type=audio/opus`;
            
            this.websocket = new WebSocket(wsUrl);

            return new Promise<void>((resolve, reject) => {
                this.websocket!.onopen = () => {
                    console.log('WebSocket connected.');
                    resolve();
                };

                this.websocket!.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    this.options.onMessage(message);
                };

                this.websocket!.onclose = () => {
                    console.log('WebSocket disconnected.');
                    this.websocket = null;
                };

                this.websocket!.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.options.onError(error);
                    reject(error);
                };
            });
        } catch (error) {
            this.options.onError(error);
            throw error;
        }
    }

    public async startRecording() {
        if (!this.websocket) {
            throw new Error('WebSocket not connected.');
        }

        // Send initial configuration for the session
        this.websocket.send(JSON.stringify({
            model: "models/gemini-1.5-flash-latest",
        }));


        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(this.mediaStream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const reader = new FileReader();
                reader.onload = () => {
                    this.websocket!.send(JSON.stringify({
                        "audio": (reader.result as string).split(',')[1]
                    }));
                };
                reader.readAsDataURL(event.data);
            }
        };

        this.mediaRecorder.start(200); // Send data every 200ms
    }

    public stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
    }

    public sendMessage(message: string) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                "parts": [{ "text": message }]
            }));
        }
    }

    public disconnect() {
        this.stopRecording();
        if (this.websocket) {
            this.websocket.close();
        }
    }
}
