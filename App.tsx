
import React, { useState, useEffect, useRef } from 'react';
import AashuAvatar from './components/AashuAvatar';
import ControlPanel from './components/ControlPanel';
import ChatOverlay from './components/ChatOverlay';
import { setupLiveSession, stopLiveSession } from './services/geminiLiveService';

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState<string>('');
  const [userTranscription, setUserTranscription] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [aashuMood, setAashuMood] = useState<'neutral' | 'happy' | 'sad' | 'blush'>('neutral');
  const [audioLevel, setAudioLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(null);

  useEffect(() => {
    if (transcription) {
      const lower = transcription.toLowerCase();
      if (lower.includes('smile') || lower.includes('happy') || lower.includes('pyaari') || lower.includes('mast')) setAashuMood('happy');
      else if (lower.includes('shy') || lower.includes('blush') || lower.includes('sharam')) setAashuMood('blush');
      else if (lower.includes('sad') || lower.includes('tension') || lower.includes('udaas')) setAashuMood('sad');
      else {
        const timer = setTimeout(() => setAashuMood('neutral'), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [transcription]);

  const toggleCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (isActive) {
      stopAashu();
      setTimeout(() => startAashu(newMode), 150);
    }
  };

  const startAashu = async (mode: 'user' | 'environment' = facingMode) => {
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioAnalyserRef.current = analyser;

      const updateLevel = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average * 1.5);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      await setupLiveSession({
        onOpen: (session) => { 
          setIsConnecting(false); 
          setIsActive(true); 
          setAashuMood('happy');
          // UNIQUE START TRIGGER: Forces a fresh greeting based on expression
          session.sendRealtimeInput({ 
            text: `SESSION_START: Analyze the Boss's current expression and surroundings from the camera feed. 
            Greet him in a completely unique, fresh way. Mention one thing you see or notice about his mood instantly. 
            Do not use your previous greeting style.` 
          });
        },
        onMessage: (msg) => {
          if (msg.serverContent?.outputTranscription) setTranscription(msg.serverContent.outputTranscription.text);
          if (msg.serverContent?.inputTranscription) setUserTranscription(msg.serverContent.inputTranscription.text);
          
          if (msg.serverContent?.turnComplete) {
            setTimeout(() => { 
              setTranscription(''); 
              setUserTranscription(''); 
            }, 1200); 
          }
        },
        onError: () => stopAashu(),
        onClose: () => { 
          setIsActive(false); 
          setAashuMood('neutral');
        },
        videoElement: videoRef.current,
        canvasElement: canvasRef.current,
        audioStream: stream
      });
    } catch (error) { 
      console.error(error);
      setIsConnecting(false); 
    }
  };

  const stopAashu = () => {
    stopLiveSession();
    setIsActive(false);
    setIsConnecting(false);
    setAashuMood('neutral');
    if (cameraStream) { 
      cameraStream.getTracks().forEach(track => track.stop()); 
      setCameraStream(null); 
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setAudioLevel(0);
  };

  return (
    <div className="relative w-full h-screen bg-[#01020a] flex flex-col items-center justify-center overflow-hidden font-sans text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(60,20,100,0.2),transparent_70%)] pointer-events-none"></div>
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Feed */}
      <div className={`absolute top-6 left-6 z-40 transition-all duration-300 ${isActive || isConnecting ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
        <div className="relative group">
          <div className="w-32 h-44 md:w-40 md:h-56 rounded-2xl overflow-hidden border border-white/10 shadow-2xl glass-morphism">
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover contrast-125 brightness-110 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
          </div>
          
          <button 
            onClick={toggleCamera}
            className="absolute -bottom-3 -right-3 w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg border-2 border-[#01020a] hover:scale-110 transition-transform active:scale-95 z-50"
          >
            <i className={`fa-solid ${facingMode === 'user' ? 'fa-camera-rotate' : 'fa-camera'} text-white text-xs`}></i>
          </button>
        </div>
      </div>

      <AashuAvatar 
        isActive={isActive} 
        isConnecting={isConnecting} 
        mood={aashuMood} 
        isTalking={!!transcription} 
        isUserSpeaking={audioLevel > 15} 
        audioLevel={audioLevel} 
      />
      
      <ChatOverlay aiText={transcription} userText={userTranscription} isActive={isActive} />
      
      <div className="absolute bottom-10 z-50 flex items-center justify-center w-full px-10">
        <ControlPanel 
          isActive={isActive} 
          isConnecting={isConnecting} 
          onToggle={isActive ? stopAashu : () => startAashu()} 
          audioLevel={audioLevel} 
        />
      </div>

      {isActive && (
        <div className="absolute top-10 right-10 flex flex-col items-end space-y-3 pointer-events-none">
          <div className="flex items-center space-x-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_#4ade80]"></div>
            <span className="text-[10px] font-bold text-white uppercase tracking-wider italic">Aashu Link: Locked</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
