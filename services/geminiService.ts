
import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";
import { decodeBase64, decodeAudioData } from "./audioUtils";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export interface TTSRequest {
  text: string;
  voiceName: VoiceName;
  instruction?: string;
}

export async function generateSingleSpeakerSpeech(
  request: TTSRequest,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const prompt = request.instruction 
    ? `${request.instruction}: ${request.text}` 
    : request.text;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: request.voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini");
  }

  const audioBytes = decodeBase64(base64Audio);
  return await decodeAudioData(audioBytes, audioContext);
}

export interface MultiSpeakerRequest {
  lines: { speaker: string; text: string; voice: VoiceName }[];
}

export async function generateMultiSpeakerSpeech(
  request: MultiSpeakerRequest,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  // We handle multi-speaker by mapping voices
  // Note: Current SDK might require a specific multiSpeakerVoiceConfig structure
  // For simplicity and reliability, we'll construct a prompt that outlines the conversation
  
  const conversationPrompt = request.lines.map(l => `${l.speaker}: ${l.text}`).join('\n');
  const speakers = Array.from(new Set(request.lines.map(l => l.speaker)));
  
  if (speakers.length > 2) {
    throw new Error("Current TTS model supports up to 2 distinct speakers in one multi-speaker configuration.");
  }

  const speakerVoiceConfigs = speakers.map(s => {
    const firstLineWithSpeaker = request.lines.find(l => l.speaker === s);
    return {
      speaker: s,
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: firstLineWithSpeaker?.voice || VoiceName.Kore }
      }
    };
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `TTS the following conversation:\n${conversationPrompt}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakerVoiceConfigs as any
        }
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini");
  }

  const audioBytes = decodeBase64(base64Audio);
  return await decodeAudioData(audioBytes, audioContext);
}
