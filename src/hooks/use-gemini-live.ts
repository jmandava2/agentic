
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
  const [isConnected, setIsConnected] = useState(false);

  const { toast } = useToast();
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const geminiApiRef = useRef<GeminiLiveApi | null>(null);

  const stopRecording = useCallback(() => {
    if (!geminiApiRef.current) return;
    geminiApiRef.current.stopRecording();
    if(sourceNodeRef.current) {
        sourceNodeRef.current.stop();
    }
    audioQueueRef.current = [];
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const processAudioQueue = useCallback(() => {
    if (isSpeaking || audioQueueRef.current.length === 0) {
      return;
    }

    setIsSpeaking(true);
    const audioContext = audioContextRef.current;
    if (!audioContext) {
        setIsSpeaking(false);
        return;
    };
    
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

  const handleMessage = useCallback((message: any) => {
    if (message.transcript) {
      setTranscript(message.transcript);
      onTranscript?.(message.transcript);
    }
    if (message.final) {
      setFinalTranscript(message.final);
      onFinalTranscript?.(message.final);
      // Stop listening after a final response is received.
      stopRecording();
    }
    if (message.audio) {
      const audioContext = audioContextRef.current;
      if (audioContext) {
        audioContext.decodeAudioData(message.audio).then((decodedData) => {
          audioQueueRef.current.push(decodedData);
          processAudioQueue();
        });
      }
    }
  }, [onTranscript, onFinalTranscript, processAudioQueue, stopRecording]);

  const handleError = useCallback((error: any) => {
    console.error('Gemini Live Error:', error);
    toast({
        variant: 'destructive',
        title: 'Voice Error',
        description: 'Something went wrong with the voice connection.'
    })
    onError?.(error);
    setIsListening(false);
    setIsConnected(false);
  }, [onError, toast]);


  useEffect(() => {
     if (!audioContextRef.current) {
      try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
      } catch (e) {
        console.error("AudioContext is not supported.", e);
        toast({
            variant: 'destructive',
            title: 'Browser Not Supported',
            description: 'Your browser does not support the Web Audio API.'
        });
      }
    }
    
    const options: GeminiLiveApiOptions = {
        onMessage: handleMessage,
        onError: handleError,
    }
    geminiApiRef.current = new GeminiLiveApi(options);

    return () => {
      geminiApiRef.current?.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [handleMessage, handleError, toast]);

  const startRecording = useCallback(async () => {
    if (isListening || !geminiApiRef.current) return;
    setTranscript('');
    setFinalTranscript('');
    setIsListening(true);
    
    try {
        await geminiApiRef.current.connect();
        setIsConnected(true);
        await geminiApiRef.current.startRecording();
    } catch(e) {
        handleError(e);
    }
  }, [isListening, handleError]);

  const sendMessage = useCallback((message: string) => {
    if (geminiApiRef.current && isConnected) {
      geminiApiRef.current.sendMessage(message);
      onSend?.(message);
    }
  }, [isConnected, onSend]);

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
