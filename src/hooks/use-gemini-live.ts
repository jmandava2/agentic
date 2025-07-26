
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GeminiLiveApi, type GeminiLiveApiOptions } from '@/lib/gemini-live';
import { useToast } from './use-toast';

declare global {
  interface Window {
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }
}

type UseGeminiLiveProps = {
  onTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onSend?: (message: string) => void;
  onError?: (error: any) => void;
};

export const useGeminiLive = (props: UseGeminiLiveProps = {}) => {
  const { onTranscript, onFinalTranscript, onSend, onError } = props;
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');

  const { toast } = useToast();
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const geminiApiRef = useRef<GeminiLiveApi | null>(null);

  const processAudioQueue = useCallback(() => {
    if (isSpeaking || audioQueueRef.current.length === 0) {
      return;
    }

    setIsSpeaking(true);
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      setIsSpeaking(false);
      return;
    }

    const source = audioContext.createBufferSource();
    sourceNodeRef.current = source;
    const nextAudio = audioQueueRef.current.shift();

    if (nextAudio) {
      source.buffer = nextAudio;
      source.connect(audioContext.destination);
      source.onended = () => {
        setIsSpeaking(false);
        processAudioQueue();
      };
      source.start();
    } else {
      setIsSpeaking(false);
    }
  }, [isSpeaking]);

  const handleOpen = useCallback(() => {
    setIsListening(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsListening(false);
    if (transcript) {
      onFinalTranscript?.(transcript);
    }
  }, [transcript, onFinalTranscript]);

  const handleMessage = useCallback(
    (message: any) => {
      if (message.text) {
        setTranscript(message.text);
        onTranscript?.(message.text);
      }

      if (message.audio) {
        const audioContext = audioContextRef.current;
        if (audioContext && message.audio.audioData) {
          const audioData = new Uint8Array(message.audio.audioData).buffer;
          audioContext
            .decodeAudioData(audioData)
            .then((decodedData) => {
              audioQueueRef.current.push(decodedData);
              processAudioQueue();
            })
            .catch((e) => console.error('Error decoding audio data', e));
        }
      }
    },
    [onTranscript, processAudioQueue]
  );

  const handleError = useCallback(
    (error: any) => {
      console.error('Gemini Live Error:', error);
      toast({
        variant: 'destructive',
        title: 'Voice Error',
        description: 'Something went wrong with the voice connection.',
      });
      onError?.(error);
      setIsListening(false);
    },
    [onError, toast]
  );

  useEffect(() => {
    if (!audioContextRef.current) {
      try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
      } catch (e) {
        console.error('AudioContext is not supported.', e);
        toast({
          variant: 'destructive',
          title: 'Browser Not Supported',
          description: 'Your browser does not support the Web Audio API.',
        });
      }
    }

    const options: GeminiLiveApiOptions = {
      onMessage: handleMessage,
      onError: handleError,
      onOpen: handleOpen,
      onClose: handleClose,
    };
    geminiApiRef.current = new GeminiLiveApi(options);

    return () => {
      geminiApiRef.current?.stopSession();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    if (isListening || !geminiApiRef.current) return;
    setTranscript('');
    setFinalTranscript('');

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      geminiApiRef.current.startSession();
    } catch (e) {
      handleError(e);
    }
  }, [isListening, handleError]);

  const stopRecording = useCallback(() => {
    if (!geminiApiRef.current) return;
    geminiApiRef.current.stopSession();
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
    }
    audioQueueRef.current = [];
    setIsSpeaking(false);
    onFinalTranscript?.(transcript);
  }, [transcript, onFinalTranscript]);

  const sendMessage = useCallback(
    (message: string) => {
        // Text messages during an active audio stream is not supported in this implementation.
        console.warn("Sending text messages is not supported in this voice-only client.");
    },
    []
  );

  return {
    isListening,
    isSpeaking,
    transcript,
    finalTranscript,
    startRecording,
    stopRecording,
    sendMessage,
  };
};
