'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GeminiLiveApi, type GeminiLiveApiOptions } from '@/lib/gemini-live';
import { useToast } from './use-toast';

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
  const geminiApiRef = useRef<GeminiLiveApi | null>(null);

  const handleMessage = useCallback((message: any) => {
    console.log('Received message:', message);
    
    // Handle text responses
    if (message.candidates?.[0]?.content?.parts?.[0]?.text) {
      const text = message.candidates[0].content.parts[0].text;
      setTranscript(text);
      onTranscript?.(text);
    }
    
    // Handle server content (for live API)
    if (message.serverContent?.modelTurn?.parts) {
      const parts = message.serverContent.modelTurn.parts;
      for (const part of parts) {
        if (part.text) {
          setTranscript(part.text);
          onTranscript?.(part.text);
        }
      }
    }

    // Handle turn completion
    if (message.serverContent?.turnComplete) {
      setFinalTranscript(transcript);
      onFinalTranscript?.(transcript);
      setIsListening(false);
    }

    // Handle audio (simplified)
    if (message.audio) {
      setIsSpeaking(true);
      // You can add audio playback logic here
      setTimeout(() => setIsSpeaking(false), 2000);
    }
  }, [onTranscript, onFinalTranscript, transcript]);

  const handleError = useCallback((error: any) => {
    console.error('Gemini Live Error:', error);
    toast({
      variant: 'destructive',
      title: 'Voice Error',
      description: 'Something went wrong with the voice connection.'
    });
    onError?.(error);
    setIsListening(false);
    setIsConnected(false);
  }, [onError, toast]);

  useEffect(() => {
    const options: GeminiLiveApiOptions = {
      onMessage: handleMessage,
      onError: handleError,
    };
    geminiApiRef.current = new GeminiLiveApi(options);

    return () => {
      geminiApiRef.current?.disconnect();
    };
  }, [handleMessage, handleError]);

  const startRecording = useCallback(async () => {
    if (isListening || !geminiApiRef.current) return;
    
    setTranscript('');
    setFinalTranscript('');
    setIsListening(true);
    
    try {
      await geminiApiRef.current.startRecording();
      setIsConnected(true);
    } catch (e) {
      handleError(e as Error);
    }
  }, [isListening, handleError]);

  const stopRecording = useCallback(() => {
    if (!geminiApiRef.current) return;
    geminiApiRef.current.stopRecording();
    setIsListening(false);
    setIsSpeaking(false);
    setIsConnected(false);
  }, []);

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
