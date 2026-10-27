import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../services/firebase';
import { useUIStore } from '../store/useUIStore';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://gymbro-api.onrender.com';
const MAX_RECORDING_MS = 60_000;

/** One recording owns one timer and at most one transcription. */
export function useVoiceCapture({ onAutoTranscript, enabled = true } = {}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const showError = useUIStore((s) => s.showError);
  const timer = useRef(null);
  const phase = useRef('idle');
  const generation = useRef(0);
  const controller = useRef(null);
  const onAutoRef = useRef(onAutoTranscript);
  useEffect(() => { onAutoRef.current = onAutoTranscript; }, [onAutoTranscript]);

  const cancel = useCallback(() => {
    generation.current += 1;
    clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    controller.current = null;
    const previousPhase = phase.current;
    setIsRecording(false);
    setIsTranscribing(false);
    if (previousPhase === 'recording') {
      phase.current = 'cancelling';
      recorder.stop().catch(() => {}).finally(() => {
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        if (phase.current === 'cancelling') phase.current = 'idle';
      });
    } else if (previousPhase === 'starting' || previousPhase === 'stopping' || previousPhase === 'transcribing') {
      phase.current = 'cancelling';
    } else if (previousPhase !== 'cancelling') {
      phase.current = 'idle';
    }
  }, [recorder]);

  // Cleanup runs on close as well as unmount, before a new enabled session.
  useEffect(() => cancel, [enabled, cancel]);

  const stopAndTranscribe = useCallback(async (automatic = false) => {
    if (phase.current !== 'recording') return null;
    const token = generation.current;
    phase.current = 'stopping';
    clearTimeout(timer.current);
    timer.current = null;
    setIsRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false });
      if (token !== generation.current || !uri) return null;
      phase.current = 'transcribing';
      setIsTranscribing(true);
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in to transcribe a recording.');
      const idToken = await user.getIdToken(false);
      if (token !== generation.current || auth.currentUser !== user) return null;
      const form = new FormData();
      form.append('audio', { uri, name: 'voice-note.m4a', type: 'audio/m4a' });
      const abort = new AbortController();
      controller.current = abort;
      const response = await fetch(`${BASE_URL}/api/audio/transcribe`, {
        method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: form, signal: abort.signal,
      });
      const payload = await response.json().catch(() => null);
      if (token !== generation.current || auth.currentUser !== user) return null;
      if (!response.ok) throw new Error(payload?.message || 'Voice transcription is temporarily unavailable');
      const transcript = payload?.data?.transcript ?? null;
      if (automatic && transcript) onAutoRef.current?.(transcript);
      return transcript;
    } catch (error) {
      if (token === generation.current) showError(error?.message || 'Voice transcription failed ? check your connection');
      return null;
    } finally {
      if (token === generation.current) {
        controller.current = null;
        phase.current = 'idle';
        setIsTranscribing(false);
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      } else if (phase.current === 'cancelling') {
        phase.current = 'idle';
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    }
  }, [recorder, showError]);

  const startRecording = useCallback(async () => {
    if (!enabled || phase.current !== 'idle') return false;
    phase.current = 'starting';
    const token = ++generation.current;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (token !== generation.current) return false;
      if (!permission.granted) throw new Error('Microphone permission is needed for voice notes');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (token !== generation.current) { await setAudioModeAsync({ allowsRecording: false }); return false; }
      await recorder.prepareToRecordAsync();
      if (token !== generation.current) {
        await recorder.stop().catch(() => {});
        await setAudioModeAsync({ allowsRecording: false });
        return false;
      }
      recorder.record();
      phase.current = 'recording';
      setIsRecording(true);
      timer.current = setTimeout(() => {
        if (token === generation.current) void stopAndTranscribe(true);
      }, MAX_RECORDING_MS);
      return true;
    } catch (error) {
      if (token === generation.current) {
        phase.current = 'idle';
        showError(error?.message || 'Couldn?t start recording');
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
      return false;
    } finally {
      if (token !== generation.current && phase.current === 'cancelling') {
        phase.current = 'idle';
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    }
  }, [enabled, recorder, showError, stopAndTranscribe]);

  return { isRecording, isTranscribing, startRecording, stopAndTranscribe, cancel };
}
