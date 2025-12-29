
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceName, AudioResult } from './types';
import { generateSingleSpeakerSpeech } from './services/geminiService';
import { AudioVisualizer } from './components/AudioVisualizer';

interface VoiceAgent {
  id: string;
  name: VoiceName;
  label: string;
  desc: string;
  icon: string;
  baseInstruction: string;
}

const AGENTS_FEMALE: VoiceAgent[] = [
  { id: 'f1', name: VoiceName.Kore, label: 'Karin', desc: 'Sekretaris Profesional', icon: '👩‍💼', baseInstruction: 'Bicara dengan nada profesional, jelas, dan sangat sopan seperti asisten kantor.' },
  { id: 'f2', name: VoiceName.Kore, label: 'Sari', desc: 'Ramah & Keibuan', icon: '👩', baseInstruction: 'Bicara dengan nada yang sangat lembut, penuh kasih sayang, dan menenangkan.' },
  { id: 'f3', name: VoiceName.Kore, label: 'Putri', desc: 'Tegas & Berwibawa', icon: '👩‍🏫', baseInstruction: 'Bicara dengan nada tegas, sedikit cepat, dan otoriter seperti seorang guru atau instruktur.' },
  { id: 'f4', name: VoiceName.Kore, label: 'Maya', desc: 'Ceria & Energik', icon: '👧', baseInstruction: 'Bicara dengan nada yang sangat bersemangat, ceria, dan penuh energi.' },
];

const AGENTS_MALE: VoiceAgent[] = [
  { id: 'm1', name: VoiceName.Zephyr, label: 'Zaki', desc: 'Asisten Modern', icon: '👨‍💻', baseInstruction: 'Bicara dengan gaya asisten AI yang cerdas, modern, dan informatif.' },
  { id: 'm2', name: VoiceName.Puck, label: 'Rian', desc: 'Remaja Gaul', icon: '👦', baseInstruction: 'Bicara dengan gaya santai, sedikit cepat, dan energik seperti anak muda.' },
  { id: 'm3', name: VoiceName.Fenrir, label: 'Budi', desc: 'Narator Berwibawa', icon: '🧔', baseInstruction: 'Bicara dengan suara berat, lambat, dan sangat dramatis seperti narator film dokumenter.' },
  { id: 'm4', name: VoiceName.Charon, label: 'Eyang', desc: 'Tua & Bijaksana', icon: '👴', baseInstruction: 'Bicara dengan nada orang tua yang lambat, bergetar sedikit, dan penuh kebijaksanaan.' },
];

const App: React.FC = () => {
  // State
  const [text, setText] = useState('Halo! Saya adalah asisten suara Gemini. Saya bisa berbicara dengan berbagai karakter suara sesuai kebutuhan Anda.');
  const [activeGender, setActiveGender] = useState<'female' | 'male'>('female');
  const [selectedAgent, setSelectedAgent] = useState<VoiceAgent>(AGENTS_FEMALE[0]);
  const [userInstruction, setUserInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AudioResult[]>([]);
  
  // Audio Controls State
  const [volume, setVolume] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0); // Detune in cents (-1200 to 1200)

  // Audio Context & Playback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<AudioBuffer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const startTimeRef = useRef(0);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    gainNodeRef.current = audioCtxRef.current.createGain();
    gainNodeRef.current.connect(audioCtxRef.current.destination);

    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Update real-time playback parameters
  useEffect(() => {
    if (sourceRef.current) {
      sourceRef.current.playbackRate.value = speed;
      sourceRef.current.detune.value = pitch;
    }
  }, [speed, pitch]);

  const updateProgress = useCallback(() => {
    if (audioCtxRef.current && isPlaying && currentAudio) {
      const elapsed = (audioCtxRef.current.currentTime - startTimeRef.current) * speed;
      setCurrentTime(elapsed);
      if (elapsed >= currentAudio.duration) {
        setIsPlaying(false);
        setCurrentTime(currentAudio.duration);
      } else {
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    }
  }, [isPlaying, currentAudio, speed]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    } else {
      cancelAnimationFrame(animationRef.current);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, updateProgress]);

  const handleStop = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const handlePlay = (buffer: AudioBuffer) => {
    if (!audioCtxRef.current || !gainNodeRef.current) return;
    handleStop();

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    source.detune.value = pitch;
    source.connect(gainNodeRef.current);
    
    startTimeRef.current = audioCtxRef.current.currentTime;
    source.start();
    sourceRef.current = source;
    setCurrentAudio(buffer);
    setIsPlaying(true);
    setCurrentTime(0);

    source.onended = () => setIsPlaying(false);
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      if (!audioCtxRef.current) throw new Error("Audio Context not initialized");
      
      const fullInstruction = `${selectedAgent.baseInstruction} ${userInstruction}`.trim();
      
      const buffer = await generateSingleSpeakerSpeech({
        text,
        voiceName: selectedAgent.name,
        instruction: fullInstruction
      }, audioCtxRef.current);

      const newResult: AudioResult = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        text,
        audioBuffer: buffer,
        voice: selectedAgent.label,
        settings: { volume, speed, pitch }
      };

      setHistory(prev => [newResult, ...prev]);
      handlePlay(buffer);
    } catch (err: any) {
      setError(err.message || "Gagal menghasilkan suara");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAudio = (buffer: AudioBuffer) => {
    const length = buffer.length * 2;
    const bufferArray = new ArrayBuffer(44 + length);
    const view = new DataView(bufferArray);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    const blob = new Blob([bufferArray], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gemini-tts-${selectedAgent.label}-${Date.now()}.wav`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">Gemini TTS Studio</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Advanced Vocal Engine</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex items-center gap-4 text-xs font-bold text-slate-500">
              <span className="text-indigo-600">EDITOR</span>
              <span className="opacity-30">|</span>
              <span className="hover:text-slate-700 cursor-pointer">PRESETS</span>
            </nav>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-bold text-slate-600 uppercase">System Ready</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Workspace: Left & Middle */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Main Editor Section */}
          <section className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-200/60 p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8">
               <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest vertical-text">GEMINI_ENGINE_2.5</span>
            </div>
            
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-1">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Teks Editor</h2>
                <p className="text-xs text-slate-400">Masukkan naskah yang ingin diubah menjadi suara</p>
              </div>
              <div className="bg-slate-50 px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 border border-slate-100">
                {text.length} CHARS
              </div>
            </div>

            <textarea
              className="w-full h-64 p-8 bg-slate-50/50 rounded-3xl border border-slate-100 focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500/30 transition-all outline-none resize-none text-slate-800 leading-relaxed text-xl font-medium"
              placeholder="Tuliskan sesuatu yang epik..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            
            <div className="mt-8 space-y-8">
              {/* Agent Category Tabs */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Karakter Agen</h3>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button 
                      onClick={() => { setActiveGender('female'); setSelectedAgent(AGENTS_FEMALE[0]); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeGender === 'female' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Perempuan
                    </button>
                    <button 
                      onClick={() => { setActiveGender('male'); setSelectedAgent(AGENTS_MALE[0]); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeGender === 'male' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Laki-laki
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(activeGender === 'female' ? AGENTS_FEMALE : AGENTS_MALE).map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className={`relative flex flex-col items-center p-5 rounded-3xl border-2 transition-all duration-300 ${
                        selectedAgent.id === agent.id 
                          ? 'bg-indigo-50/50 border-indigo-500 shadow-lg shadow-indigo-100' 
                          : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-3xl mb-3 drop-shadow-sm">{agent.icon}</span>
                      <span className={`text-sm font-black tracking-tight ${selectedAgent.id === agent.id ? 'text-indigo-700' : 'text-slate-700'}`}>{agent.label}</span>
                      <span className="text-[10px] text-slate-400 font-bold mt-1 text-center leading-tight uppercase tracking-tighter">{agent.desc}</span>
                      {selectedAgent.id === agent.id && (
                        <div className="absolute top-3 right-3">
                          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

               <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Modifikasi Gaya</h3>
                  <span className="text-[10px] font-bold text-slate-400 italic">Overrides default agent behavior</span>
                </div>
                <input
                  type="text"
                  className="w-full p-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-sm focus:ring-4 focus:ring-indigo-500/10 outline-none font-medium text-slate-600"
                  placeholder="Opsional: Tambahkan instruksi khusus (misal: Bicara lebih cepat, bisik-bisik...)"
                  value={userInstruction}
                  onChange={(e) => setUserInstruction(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-10">
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-4 px-10 py-5 rounded-3xl font-black text-xl transition-all ${
                  isLoading 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-white hover:scale-[1.01] active:scale-[0.99] shadow-2xl shadow-indigo-200'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>MENSINTESIS SUARA...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168l4.2 2.8a1 1 0 010 1.664l-4.2 2.8A1 1 0 018 13.56V7.44a1 1 0 011.555-.832z"></path>
                    </svg>
                    <span>HASILKAN AUDIO</span>
                  </>
                )}
              </button>
            </div>
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                <p className="text-xs font-bold">{error}</p>
              </div>
            )}
          </section>

          {/* Player Bar (Conditional) */}
          {(currentAudio || isPlaying) && (
            <section className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-indigo-950/20 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                    <span className="text-2xl animate-pulse">{selectedAgent.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest">{selectedAgent.label}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Current Playback Session</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black font-mono tracking-tighter text-indigo-400">{currentTime.toFixed(1)}</span>
                    <span className="text-xs font-bold text-slate-600 uppercase">sec</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Total: {currentAudio?.duration.toFixed(1)}s</p>
                </div>
              </div>
              
              <AudioVisualizer isPlaying={isPlaying} audioBuffer={currentAudio} currentTime={currentTime} />
              
              <div className="flex gap-4">
                <button 
                  onClick={() => currentAudio && handlePlay(currentAudio)}
                  className="flex-1 py-4 bg-white text-slate-900 hover:bg-slate-100 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg"
                >
                  {isPlaying ? 'Putar Ulang' : 'Putar Audio'}
                </button>
                <button 
                  onClick={() => currentAudio && downloadAudio(currentAudio)}
                  className="px-6 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-indigo-400 transition-all border border-slate-700"
                  title="Unduh File"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
                {isPlaying && (
                  <button onClick={handleStop} className="px-6 py-4 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-2xl font-black text-xs uppercase transition-all border border-red-500/30">
                    STOP
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Controls Panel: Right */}
        <div className="lg:col-span-4 space-y-8">
          
          <section className="bg-white rounded-[2rem] shadow-xl border border-slate-200/60 p-8">
            <h2 className="text-xs font-black text-slate-900 mb-8 flex items-center gap-2 uppercase tracking-widest">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              Mixing Console
            </h2>

            <div className="space-y-8">
              {/* Volume Control */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Volume</span>
                  <span className="text-sm font-black font-mono text-slate-900">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="2" step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Speed Control */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kecepatan (Speed)</span>
                  <span className="text-sm font-black font-mono text-slate-900">{speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range" min="0.5" max="2.0" step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                  <span>Lambat</span>
                  <span>Normal</span>
                  <span>Cepat</span>
                </div>
              </div>

              {/* Pitch Control */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nada Suara (Pitch)</span>
                  <span className="text-sm font-black font-mono text-slate-900">{pitch > 0 ? '+' : ''}{pitch} cents</span>
                </div>
                <input
                  type="range" min="-1200" max="1200" step="100"
                  value={pitch}
                  onChange={(e) => setPitch(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                  <span>Rendah</span>
                  <span>Default</span>
                  <span>Tinggi</span>
                </div>
              </div>
            </div>
          </section>

          {/* History Section */}
          <section className="bg-white rounded-[2rem] shadow-xl border border-slate-200/60 p-8 flex flex-col min-h-[400px]">
            <h2 className="text-xs font-black text-slate-900 mb-8 flex items-center gap-2 uppercase tracking-widest">
              <div className="p-2 bg-slate-50 rounded-lg">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Arsip Suara
            </h2>
            
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-20">
                    <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <p className="text-xs font-black uppercase">Kosong</p>
                </div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id}
                    className="p-5 bg-slate-50/50 hover:bg-indigo-50/30 rounded-[1.5rem] border border-slate-100 transition-all cursor-pointer group hover:border-indigo-100"
                    onClick={() => handlePlay(item.audioBuffer)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-black text-indigo-600 bg-white px-3 py-1 rounded-full shadow-sm border border-indigo-50 uppercase">{item.voice}</span>
                      <span className="text-[10px] text-slate-300 font-bold">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed font-medium">"{item.text}"</p>
                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                       <span className="text-[10px] text-indigo-500 font-black uppercase tracking-tighter">REPLAY &rarr;</span>
                       <button 
                        className="text-slate-300 hover:text-indigo-600 transition-colors"
                        onClick={(e) => { e.stopPropagation(); downloadAudio(item.audioBuffer); }}
                       >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                       </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-3">
             <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                </div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Powered by Gemini 2.5 Multi-Modal Engine
                </p>
             </div>
          </div>
          <div className="flex gap-12">
            <a href="#" className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest transition-colors">Documentation</a>
            <a href="#" className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest transition-colors">Advanced Settings</a>
            <a href="#" className="text-[10px] text-slate-400 hover:text-indigo-600 font-black uppercase tracking-widest transition-colors">System Logs</a>
          </div>
        </div>
      </footer>
      
      <style>{`
        .vertical-text {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        
        input[type='range'] {
          -webkit-appearance: none;
          background: #f1f5f9;
        }
        
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(79, 70, 229, 0.2);
          transition: transform 0.1s ease;
        }
        
        input[type='range']::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};

export default App;
