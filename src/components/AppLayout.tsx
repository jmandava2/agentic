
'use client';

import { type ReactNode, useState } from 'react';
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

  const { isListening, transcript, isSpeaking, stopRecording, startRecording } = useGeminiLive({
    onTranscript: setMessage,
    onSend: (msg) => {
        // In this new model, sending is part of the stream.
        // We can update the final message here if needed.
        setMessage(msg);
    }
  });

  const { isCameraOpen, closeCamera } = useCamera();


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
