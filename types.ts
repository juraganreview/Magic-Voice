
export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export interface SpeakerConfig {
  name: string;
  voice: VoiceName;
}

export interface DialogueLine {
  id: string;
  speaker: string;
  text: string;
}

export interface AudioResult {
  id: string;
  timestamp: number;
  text: string;
  audioBuffer: AudioBuffer;
  voice: string;
  settings: {
    volume: number;
    speed: number;
    pitch: number;
  };
}
