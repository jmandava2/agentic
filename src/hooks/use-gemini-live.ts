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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Play audio response from base64 data
  const playAudioResponse = useCallback(async (audioData: string) => {
    try {
      const audioContext = await initAudioContext();
      
      // Convert base64 to array buffer
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      
      // Create and play audio source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        setIsSpeaking(false);
      };
      
      source.start(0);
    } catch (error) {
      console.error('Error playing audio response:', error);
      setIsSpeaking(false);
      toast({
        variant: 'destructive',
        title: 'Audio Error',
        description: 'Failed to play audio response.'
      });
    }
  }, [initAudioContext, toast]);

  const handleMessage = useCallback((message: any) => {
    console.log('Processing message:', message);
    
    // Handle text responses from candidates
    if (message.candidates?.[0]?.content?.parts?.[0]?.text) {
      const text = message.candidates[0].content.parts[0].text;
      console.log('Text response received:', text);
      setTranscript(text);
      onTranscript?.(text);
      setIsListening(false); // Stop listening when we get a response
      return;
    }
    
    // Handle server content (for live API)
    if (message.serverContent?.modelTurn?.parts) {
      const parts = message.serverContent.modelTurn.parts;
      for (const part of parts) {
        if (part.text) {
          console.log('Server text response:', part.text);
          setTranscript(part.text);
          onTranscript?.(part.text);
        }
        
        // Handle audio in the same loop
        if (part.inlineData?.mimeType?.startsWith('audio/')) {
          console.log('Audio response received');
          setIsSpeaking(true);
          playAudioResponse(part.inlineData.data);
        }
      }
    }

    // Handle turn completion
    if (message.serverContent?.turnComplete) {
      console.log('Turn completed');
      setFinalTranscript(transcript);
      onFinalTranscript?.(transcript);
      setIsListening(false);
    }
    
    // Handle direct audio data
    if (message.audio || message.audioData) {
      console.log('Direct audio data received');
      setIsSpeaking(true);
      const audioData = message.audio || message.audioData;
      playAudioResponse(audioData);
    }
  }, [onTranscript, onFinalTranscript, transcript, playAudioResponse]);

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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
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
      
      // Auto-stop after 10 seconds to prevent infinite listening
      timeoutRef.current = setTimeout(() => {
        console.log('Auto-stopping recording after 10 seconds');
        stopRecording();
        toast({
          title: 'Recording Timeout',
          description: 'Recording stopped automatically. Try speaking closer to the microphone.'
        });
      }, 10000);
      
    } catch (e) {
      handleError(e as Error);
    }
  }, [isListening, handleError, toast]);

  const stopRecording = useCallback(() => {
    if (!geminiApiRef.current) return;
    
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
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