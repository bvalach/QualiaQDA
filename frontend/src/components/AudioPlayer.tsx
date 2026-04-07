import { useState, useRef, useEffect } from 'react';
import type { TranscriptSegment } from '../types';
import * as api from '../api';
import { useProject } from '../contexts/ProjectContext';

interface AudioPlayerProps {
  documentId: string;
  documentName: string;
  hasTranscript: boolean;
}

export function AudioPlayer({ documentId, hasTranscript }: AudioPlayerProps) {
  const { openDocument } = useProject();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [whisperOk, setWhisperOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check Whisper availability on mount
  useEffect(() => {
    api.whisperStatus().then((s) => setWhisperOk(s.available)).catch(() => setWhisperOk(false));
  }, []);

  // Load segments if transcript exists
  useEffect(() => {
    if (hasTranscript) {
      api.getTranscriptSegments(documentId)
        .then(setSegments)
        .catch(() => {/* no segments yet */});
    }
  }, [documentId, hasTranscript]);

  // Time update handler
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const handleTranscribe = async () => {
    setTranscribing(true);
    setError(null);
    try {
      const result = await api.transcribeDocument(documentId);
      setSegments(result.segments);
      // Reload the document to get the transcript text (now codeable)
      await openDocument(documentId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de transcripcion';
      setError(msg);
    } finally {
      setTranscribing(false);
    }
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      if (!isPlaying) {
        audioRef.current.play();
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Find active segment
  const activeSegmentIdx = segments.findIndex(
    (s) => currentTime >= s.start && currentTime < s.end
  );

  return (
    <div className="audio-player">
      {/* Audio element (hidden, controlled via UI) */}
      <audio ref={audioRef} src={api.audioFileUrl(documentId)} preload="metadata" />

      {/* Player controls */}
      <div className="audio-controls">
        <button className="ghost audio-play-btn" onClick={togglePlay}>
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <div className="audio-progress-container">
          <input
            type="range"
            className="audio-progress"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
          />
        </div>
        <span className="audio-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Transcription area */}
      {!hasTranscript && segments.length === 0 && (
        <div className="audio-transcribe-area">
          {whisperOk === false && (
            <div className="audio-warning">
              Whisper no disponible. Instala: pip install faster-whisper
            </div>
          )}
          {whisperOk !== false && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                Este audio no tiene transcripcion. Transcribelo para poder codificar el texto.
              </p>
              <button
                className="primary"
                onClick={handleTranscribe}
                disabled={transcribing || !whisperOk}
              >
                {transcribing ? 'Transcribiendo...' : 'Transcribir con Whisper'}
              </button>
              {transcribing && (
                <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8 }}>
                  Esto puede tardar unos minutos segun la duracion del audio...
                </p>
              )}
            </>
          )}
          {error && (
            <div className="audio-error">{error}</div>
          )}
        </div>
      )}

      {/* Timestamped segments (synced with audio) */}
      {segments.length > 0 && (
        <div className="audio-segments">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`audio-segment ${i === activeSegmentIdx ? 'active' : ''}`}
              onClick={() => seekTo(seg.start)}
            >
              <span className="audio-segment-time">{formatTime(seg.start)}</span>
              <span className="audio-segment-text">{seg.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
