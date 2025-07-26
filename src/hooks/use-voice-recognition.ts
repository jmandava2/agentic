// This file is no longer needed and can be deleted.
// The new `useGeminiLive` hook replaces its functionality.
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './use-toast';
import { useCamera } from './use-camera';

type UseVoiceRecognitionProps = {
  onNoSupport?: () => void;
  onMessage?: (message: string) => void;
  onSend?: () => void;
};

const navigationCommands: Record<string, string> = {
  'go to dashboard': '/dashboard',
  'open dashboard': '/dashboard',
  'show me the dashboard': '/dashboard',
  'navigate to dashboard': '/dashboard',
  'go to market advisory': '/market-advisory',
  'go to market': '/market-advisory',
  'open market advisory': '/market-advisory',
  'open market': '/market-advisory',
  'check prices': '/market-advisory',
  'navigate to market advisory': '/market-advisory',
  'navigate to market': '/market-advisory',
  'go to schemes': '/schemes',
  'open schemes': '/schemes',
  'navigate to schemes': '/schemes',
  'log out': '/',
  'sign out': '/',
};

const actionCommands: Record<
  string,
  (actions: { openCamera: () => void; toast: any; onSend?: () => void }) => string | void
> = {
  'open camera': ({ openCamera }) => openCamera(),
  'show camera': ({ openCamera }) => openCamera(),
  'launch camera': ({ openCamera }) => openCamera(),
  'send message': ({ onSend }) => {
    onSend?.();
    return 'send';
  },
  'go to profile': ({ toast }) =>
    toast({
      title: 'Coming Soon',
      description: 'The profile page is under construction.',
    }),
  'my account': ({ toast }) =>
    toast({
      title: 'Coming Soon',
      description: 'The profile page is under construction.',
    }),
  'open my account': ({ toast }) =>
    toast({
      title: 'Coming Soon',
      description: 'The profile page is under construction.',
    }),
  'navigate to my account': ({ toast }) =>
    toast({
      title: 'Coming Soon',
      description: 'The profile page is under construction.',
    }),
};


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
  const { onNoSupport, onMessage, onSend } = props;
  const router = useRouter();
  const { toast } = useToast();
  const { openCamera } = useCamera();
  const [isListening, setIsListening] = useState(isListeningGlobally);
  const [transcript, setTranscript] = useState('');
  const [hasRecognitionSupport, setHasRecognitionSupport] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const processCommand = useCallback(
    (command: string): boolean | 'send' => {
      const lowerCaseCommand = command.toLowerCase().trim();

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
        return true;
      }

      const actionCommand = Object.keys(actionCommands).find((key) =>
        lowerCaseCommand.includes(key)
      );

      if (actionCommand) {
        const result = actionCommands[actionCommand]({ openCamera, toast, onSend });
        if (result === 'send') return 'send';
        return true;
      }

      return false;
    },
    [router, toast, openCamera, onSend]
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
      onMessage?.('');
      recognitionRef.current.start();
    }
  }, [onMessage]);

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
        const currentTranscript = interimTranscript || finalTranscript;
        setTranscript(currentTranscript);
        onMessage?.(currentTranscript);

        if (finalTranscript) {
          const commandResult = processCommand(finalTranscript);
           if (commandResult && commandResult !== 'send') {
             onMessage?.('');
          }
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
      onNoSupport?.();
    }
  }, [processCommand, onNoSupport, stopListening, toast, onMessage]);

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
