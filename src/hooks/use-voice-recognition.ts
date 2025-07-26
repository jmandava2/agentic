
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './use-toast';
import { useCamera } from './use-camera';

type UseVoiceRecognitionProps = {
  onNoSupport?: () => void;
};

const navigationCommands: Record<string, string> = {
  'go to dashboard': '/dashboard',
  'open dashboard': '/dashboard',
  'show me the dashboard': '/dashboard',
  'navigate to dashboard': '/dashboard',
  'go to market': '/market-advisory',
  'open market advisory': '/market-advisory',
  'check prices': '/market-advisory',
  'navigate to market advisory': '/market-advisory',
  'go to schemes': '/schemes',
  'open schemes': '/schemes',
  'navigate to schemes': '/schemes',
  'log out': '/',
  'sign out': '/',
};

const actionCommands: Record<string, (actions: { openCamera: () => void, toast: any }) => void> = {
    'open camera': ({ openCamera }) => openCamera(),
    'show camera': ({ openCamera }) => openCamera(),
    'launch camera': ({ openCamera }) => openCamera(),
    'go to profile': ({ toast }) => toast({ title: 'Coming Soon', description: 'The profile page is under construction.' }),
    'my account': ({ toast }) => toast({ title: 'Coming Soon', description: 'The profile page is under construction.' }),
    'open my account': ({ toast }) => toast({ title: 'Coming Soon', description: 'The profile page is under construction.' }),
    'navigate to my account': ({ toast }) => toast({ title: 'Coming Soon', description: 'The profile page is under construction.' }),
};

// Global state management for voice overlay
const listeners = new Set<(state: boolean) => void>();
let isListeningGlobally = false;

const notifyListeners = () => {
  listeners.forEach((listener) => listener(isListeningGlobally));
};

const setGlobalListening = (state: boolean) => {
  if (isListeningGlobally !== state) {
    isListeningGlobally = state;
    notifyListeners();
  }
};

export const useVoiceRecognition = (props: UseVoiceRecognitionProps = {}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { openCamera } = useCamera();
  const [isListening, setIsListening] = useState(isListeningGlobally);
  const [transcript, setTranscript] = useState('');
  const [hasRecognitionSupport, setHasRecognitionSupport] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const processCommand = useCallback(
    (command: string) => {
      const lowerCaseCommand = command.toLowerCase().trim();

      const actionCommand = Object.keys(actionCommands).find((key) => 
        lowerCaseCommand.includes(key)
      );

      if (actionCommand) {
        actionCommands[actionCommand]({ openCamera, toast });
        return;
      }

      const navCommand = Object.keys(navigationCommands).find((key) =>
        lowerCaseCommand.includes(key)
      );

      if (navCommand) {
        const path = navigationCommands[navCommand];
        toast({
          title: 'Command Recognized',
          description: `Navigating to ${
            path === '/' ? 'Landing Page' : path.replace('/', '')
          }...`,
        });
        router.push(path);
        return;
      }
      
      toast({
        variant: 'destructive',
        title: 'Command not recognized',
        description: `Could not understand: "${command}"`,
      });
    },
    [router, toast, openCamera]
  );
  
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setGlobalListening(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListeningGlobally) {
       setTranscript('');
      recognitionRef.current.start();
    }
  }, []);


  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setHasRecognitionSupport(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US'; 
      recognition.interimResults = true; 
      recognition.maxAlternatives = 1;
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
            const transcriptChunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcriptChunk;
            } else {
                interimTranscript += transcriptChunk;
            }
        }
        setTranscript(interimTranscript || finalTranscript);

        if (finalTranscript) {
          processCommand(finalTranscript);
          stopListening();
        }
      };

      recognition.onstart = () => {
        setGlobalListening(true);
      };

      recognition.onend = () => {
        setGlobalListening(false);
        setTranscript('');
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          toast({
            variant: 'destructive',
            title: 'Voice Error',
            description: event.error,
          });
        }
        setGlobalListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setHasRecognitionSupport(false);
      props.onNoSupport?.();
    }
  }, [processCommand, props, stopListening, toast]);

  useEffect(() => {
    const listener = (state: boolean) => {
      setIsListening(state);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    hasRecognitionSupport,
  };
};
