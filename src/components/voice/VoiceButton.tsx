
'use client';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { useCamera } from '@/hooks/use-camera';

type VoiceButtonProps = {
    isListening: boolean;
    startListening: () => void;
    stopListening: () => void;
}

export function VoiceButton({ isListening, startListening, stopListening }: VoiceButtonProps) {
  const { isCameraOpen } = useCamera();

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggleListening}
      disabled={isCameraOpen}
      className={cn(
        'relative h-8 w-8 flex-shrink-0 rounded-full bg-foreground text-primary transition-shadow hover:bg-foreground/90',
        isListening && 'bg-primary text-primary-foreground animate-pulse'
      )}
    >
      <Mic className="h-4 w-4" />
      <span className="sr-only">
        {isListening ? 'Stop listening' : 'Start voice command'}
      </span>
    </Button>
  );
}
