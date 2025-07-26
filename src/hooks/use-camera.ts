
'use client';

import { useState, useCallback, useEffect } from 'react';

const listeners = new Set<(state: boolean) => void>();
let isCameraOpenGlobally = false;

const notifyListeners = () => {
  listeners.forEach((listener) => listener(isCameraOpenGlobally));
};

const setGlobalCameraOpen = (state: boolean) => {
  isCameraOpenGlobally = state;
  notifyListeners();
};

export const useCamera = () => {
  const [isCameraOpen, setIsCameraOpen] = useState(isCameraOpenGlobally);

  const openCamera = useCallback(() => {
    setGlobalCameraOpen(true);
  }, []);

  const closeCamera = useCallback(() => {
    setGlobalCameraOpen(false);
  }, []);
  
  const toggleCamera = useCallback(() => {
    setGlobalCameraOpen(!isCameraOpenGlobally);
  }, []);

  useEffect(() => {
    const listener = (state: boolean) => {
      setIsCameraOpen(state);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    isCameraOpen,
    openCamera,
    closeCamera,
    toggleCamera,
  };
};
