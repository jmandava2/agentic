
'use client';

import { type ReactNode, useState } from 'react';
import { Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AssistantBar } from '@/components/AssistantBar';
import { BottomNav } from '@/components/BottomNav';
import { useVoiceRecognition } from '@/hooks/use-voice-recognition';
import { VoiceOverlay } from './voice/VoiceOverlay';
import { useCamera } from '@/hooks/use-camera';
import { CameraOverlay } from './camera/CameraOverlay';
import { AttachmentContext } from '@/hooks/use-attachment';

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
  const [isSending, setIsSending] = useState(false);

  const { isListening, transcript, stopListening } = useVoiceRecognition({
     onMessage: setMessage,
     onSend: () => setIsSending(true),
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
        isSending={isSending}
        setIsSending={setIsSending}
      />
      <BottomNav />
      <VoiceOverlay
        isOpen={isListening}
        transcript={transcript}
        onClose={stopListening}
      />
      <CameraOverlay isOpen={isCameraOpen} onClose={closeCamera} />
    </AttachmentProvider>
  );
}
