
'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AssistantBar } from '@/components/AssistantBar';
import { BottomNav } from '@/components/BottomNav';
import { VoiceOverlay } from './voice/VoiceOverlay';
import { useCamera } from '@/hooks/use-camera';
import { CameraOverlay } from './camera/CameraOverlay';
import { AttachmentContext } from '@/hooks/use-attachment';
import { useGeminiLive } from '@/hooks/use-gemini-live';

function AttachmentProvider({ children }: { children: ReactNode }) {
  const [attachment, setAttachment] = useState<string | null>(null);

  return (
    <AttachmentContext.Provider value={{ attachment, setAttachment }}>
      {children}
    </AttachmentContext.Provider>
  );
}


export function AppLayout({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');

  const { isListening, transcript, isSpeaking, stopRecording, startRecording, sendMessage } = useGeminiLive({
    onTranscript: setMessage,
    onFinalTranscript: (msg) => {
        // We can process the final transcript here if needed.
        // For now, the live transcript is sufficient.
    },
    onSend: (msg) => {
        // This is handled by the sendMessage call now
        setMessage('');
    }
  });

  const { isCameraOpen, closeCamera } = useCamera();

  useEffect(() => {
    // If the assistant bar has a message from text input, send it.
    if (message && !isListening) {
        // This is a bit tricky. We need a way to distinguish text input
        // from voice transcript. For now, we assume if we are not listening,
        // and a message appears, it's from text input.
    }
  }, [message, isListening]);


  return (
    <AttachmentProvider>
      <Sidebar variant="sidebar" collapsible="icon">
        <AppSidebar />
      </Sidebar>
      <SidebarInset className="p-4 md:p-6 pb-40 md:pb-24">{children}</SidebarInset>
      <AssistantBar 
        message={message}
        setMessage={setMessage}
        isListening={isListening}
        isSending={isSpeaking}
        startListening={startRecording}
        stopListening={stopRecording}
        sendMessage={sendMessage}
      />
      <BottomNav />
      <VoiceOverlay
        isOpen={isListening}
        transcript={transcript}
        onClose={stopRecording}
      />
      <CameraOverlay isOpen={isCameraOpen} onClose={closeCamera} />
    </AttachmentProvider>
  );
}
