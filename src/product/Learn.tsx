import { useEffect, useId, useRef, useState } from 'react';
import BiologyLesson from './BiologyLesson';
import MythCheck from './MythCheck';
import { BookOpen, Check, Clock, Play, RotateCcw } from 'lucide-react';
import { videoLessons, type VideoLesson } from '../../shared/videoLessons';
import type { LessonData } from '../../shared/v2';
import { useProduct } from './context';
import { can, dataOf, Dialog, errorText, Field, Notice } from './ui';
import './video-player.css';

type Interval = [number, number];
interface PlaybackDraft {
  position: number;
  watched: Interval[];
  answers: Record<string, string>;
  ended: boolean;
  transcriptRead: boolean;
}

function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function boundedPosition(value: unknown, lesson: VideoLesson) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(value, lesson.durationSeconds)) : 0;
}

function mergeWatched(previous: Interval[], played: TimeRanges, duration: number): Interval[] {
  const ranges = [...previous];
  for (let i = 0; i < played.length; i++) ranges.push([Math.max(0, played.start(i)), Math.min(duration, played.end(i))]);
  const merged: Interval[] = [];
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 0.1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

// Only actual media played ranges count. Seeking/resuming is not watching.
// The checkpoint's intentional 31→32 second transition is not a viewing gap.
function watchedLesson(lesson: VideoLesson, watched: Interval[]) {
  let start = 0;
  const required: Interval[] = [];
  for (const checkpoint of lesson.checkpoints) {
    required.push([start, checkpoint.atSeconds]);
    start = checkpoint.resumeAtSeconds;
  }
  required.push([start, lesson.durationSeconds]);
  return required.every(([from, to]) => watched.some(([a, b]) => a <= from + 0.3 && b >= to - 0.3));
}

/** Account/space changes remount all ephemeral playback and checkpoint state. */
export default function Learn() {
  const { me, spaceId } = useProduct();
  return <LessonLibrary key={`${me.user.id}:${spaceId}`} />;
}

function LessonLibrary() {
  const product = useProduct();
  const [category, setCategory] = useState('All lessons');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<VideoLesson | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PlaybackDraft>>({});
  const latest = useRef(product);
  latest.current = product;
  const saving = useRef(false);
  // A successful create must never be repeated while a refreshed snapshot is arriving.
  const created = useRef(new Set<string>());
  const categories = ['All lessons', ...new Set(videoLessons.map(lesson => lesson.category))];
  const records = product.snapshot.entities.lessons;
  const completed = videoLessons.filter(lesson => records.some(entity => entity.data.lessonId === lesson.id && entity.data.completed === true)).length;
  const filtered = videoLessons.filter(lesson => (category === 'All lessons' || category === lesson.category)
    && `${lesson.title} ${lesson.summary} ${lesson.category}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function save(lesson: VideoLesson, draft: PlaybackDraft, complete: boolean) {
    if (saving.current) return false;
    saving.current = true;
    try {
      const context = latest.current;
      if (!can(context.snapshot, 'lessons')) throw new Error('You do not have permission to save lesson progress in this workspace.');
      const entity = context.snapshot.entities.lessons.find(item => item.data.lessonId === lesson.id);
      if (!entity && created.current.has(lesson.id)) {
        await context.refresh();
        throw new Error('Refreshing your saved lesson. Please try Save again after the library updates.');
      }
      const data: LessonData = { lessonId: lesson.id, position: draft.position, completed: entity?.data.completed === true || complete };
      const saved = entity ? await context.update(entity, data) : await context.create('lessons', data);
      if (!saved) return false;
      if (!entity) created.current.add(lesson.id);
      await context.refresh();
      return true;
    } finally { saving.current = false; }
  }

  return <div className="stack video-library">
    <header className="page-heading"><div><p className="eyebrow">UNDERSTAND, WITHOUT THE JARGON</p><h1>What’s happening in my body?</h1><p className="muted">Clear diagrams, a step at a time. Read the sources behind each explanation.</p></div><BookOpen size={36} aria-hidden="true" /></header>
    <MythCheck/>
    <BiologyLesson/>
    <section className="stack" aria-label="Video lessons"><div><p className="eyebrow">WATCH, PAUSE, UNDERSTAND</p><h2>Short explanations for everyday questions</h2><p className="muted">Narrated videos with captions, a transcript and a source for each explanation.</p></div>
    <div className="stack"><Field label="Search the library"><input type="search" placeholder="Search a topic or lesson" value={query} onChange={event => setQuery(event.target.value)} /></Field><nav className="tabs" aria-label="Lesson categories">{categories.map(item => <button type="button" className="btn ghost" aria-pressed={category === item} key={item} onClick={() => setCategory(item)}>{item}</button>)}</nav></div>
    <p className="muted small" role="status">{filtered.length} {filtered.length === 1 ? 'lesson' : 'lessons'} shown</p>
    <div className="video-grid">{filtered.map((lesson, index) => {
      const entity = records.find(item => item.data.lessonId === lesson.id);
      const saved = entity ? dataOf<'lessons'>(entity) : undefined;
      const draft = drafts[lesson.id];
      const position = boundedPosition(draft?.position ?? saved?.position, lesson);
      return <article className="video-card" key={lesson.id}>
        <div className="video-poster"><img src={lesson.poster} alt={`Animation preview: ${lesson.title}`} width={lesson.video.width} height={lesson.video.height} loading="lazy" /><span className="video-duration"><Clock size={14} aria-hidden="true" />{timestamp(lesson.durationSeconds)}</span></div>
        <div className="video-meta"><span>{String(index + 1).padStart(2, '0')} / {lesson.category}</span>{saved?.completed && <span className="chip"><Check size={14} aria-hidden="true" />Completed</span>}</div>
        <div><h2>{lesson.title}</h2><p className="muted">{lesson.summary}</p></div>
        <div className="video-library-progress"><span className="small muted">{saved?.completed ? 'Completion saved' : position > 0 ? `Resume position ${timestamp(position)} · not yet completed` : 'Ready when you are'}</span><progress aria-label={`${lesson.title}: resume position, not completion`} value={position} max={lesson.durationSeconds} /></div>
        <button type="button" className="btn secondary" aria-label={`${saved?.completed ? 'Revisit lesson' : position > 0 ? 'Continue learning' : 'Explore lesson'}: ${lesson.title}`} onClick={() => setSelected(lesson)}><Play size={18} aria-hidden="true" />{saved?.completed ? 'Revisit lesson' : position > 0 ? 'Continue learning' : 'Explore lesson'}</button>
      </article>;
    })}</div>
    {!filtered.length && <div className="empty"><p>No lessons match these filters.</p><button type="button" className="btn secondary" onClick={() => { setCategory('All lessons'); setQuery(''); }}>Show all lessons</button></div>}
    <p className="muted small">Synthetic narration · Fictional examples · General education, not personal treatment advice. Clinical review pending: these lessons have not been clinically reviewed.</p>
    </section>
    {selected && <LessonPlayer key={selected.id} lesson={selected} initial={drafts[selected.id]} savedPosition={boundedPosition(records.find(item => item.data.lessonId === selected.id)?.data.position, selected)}
      completed={records.some(item => item.data.lessonId === selected.id && item.data.completed === true)} writable={can(product.snapshot, 'lessons')} busy={product.busy}
      onSave={save} onClose={draft => { setDrafts(previous => ({ ...previous, [selected.id]: draft })); setSelected(null); }} />}
  </div>;
}

function LessonPlayer({ lesson, initial, savedPosition, completed, writable, busy, onSave, onClose }: {
  lesson: VideoLesson; initial?: PlaybackDraft; savedPosition: number; completed: boolean; writable: boolean; busy: boolean;
  onSave: (lesson: VideoLesson, draft: PlaybackDraft, complete: boolean) => Promise<boolean>;
  onClose: (draft: PlaybackDraft) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const checkpointPanel = useRef<HTMLElement>(null);
  const draft = useRef<PlaybackDraft>(initial ? { ...initial, answers: { ...initial.answers }, watched: [...initial.watched] } : { position: savedPosition, watched: [], answers: {}, ended: false, transcriptRead: false });
  const [position, setPosition] = useState(draft.current.position);
  const [answers, setAnswers] = useState(draft.current.answers);
  const [activeCheckpoint, setActiveCheckpoint] = useState<string | null>(null);
  const active = useRef<string | null>(null);
  const [ended, setEnded] = useState(draft.current.ended);
  const [watched, setWatched] = useState(draft.current.watched);
  const [transcriptMode, setTranscriptMode] = useState(false);
  const [transcriptRead, setTranscriptRead] = useState(draft.current.transcriptRead);
  const [transcript, setTranscript] = useState('');
  const [transcriptError, setTranscriptError] = useState('');
  const [transcriptAttempt, setTranscriptAttempt] = useState(0);
  const [mediaError, setMediaError] = useState('');
  const [captionError, setCaptionError] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [speed, setSpeed] = useState('1');
  const [status, setStatus] = useState('Press Play when you are ready. Playback never starts automatically.');
  const [saveError, setSaveError] = useState('');
  const [pending, setPending] = useState(false);
  const [savedCompletion, setSavedCompletion] = useState(completed);
  const saveLock = useRef(false);
  const mounted = useRef(false);
  const ready = useRef(false);
  const descriptionId = useId();
  const questionId = useId();
  const passed = lesson.checkpoints.every(checkpoint => answers[checkpoint.id] === checkpoint.correctChoiceId);
  const canComplete = passed && ((ended && watchedLesson(lesson, watched)) || (transcriptMode && !!transcript && transcriptRead));

  useEffect(() => {
    mounted.current = true;
    const element = video.current;
    return () => { mounted.current = false; element?.pause(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setTranscriptError('');
    async function load() {
      try {
        const response = await fetch(lesson.transcript, { signal: controller.signal });
        if (!response.ok) throw new Error('Transcript could not load.');
        const text = await response.text();
        if (!text.trim() || /^\s*</.test(text)) throw new Error('Transcript file is unavailable.');
        if (!controller.signal.aborted) setTranscript(text);
      } catch (error) { if (!controller.signal.aborted) setTranscriptError(errorText(error)); }
    }
    void load();
    return () => controller.abort();
  }, [lesson.transcript, transcriptAttempt]);

  useEffect(() => {
    if (activeCheckpoint) checkpointPanel.current?.focus({ preventScroll: true });
  }, [activeCheckpoint]);

  function showCheckpoint(id: string) {
    if (active.current === id) return;
    active.current = id;
    setActiveCheckpoint(id);
    setStatus('Paused for your checkpoint. Choose an answer to see feedback.');
  }

  function remember() {
    const element = video.current;
    if (!element || !ready.current) return draft.current;
    const ranges = mergeWatched(draft.current.watched, element.played, lesson.durationSeconds);
    draft.current = { ...draft.current, position: boundedPosition(element.currentTime, lesson), watched: ranges };
    setPosition(draft.current.position);
    setWatched(ranges);
    return draft.current;
  }

  function gate() {
    const element = video.current;
    if (!element || !ready.current) return;
    const checkpoint = lesson.checkpoints.find(item => draft.current.answers[item.id] !== item.correctChoiceId && element.currentTime >= item.atSeconds);
    if (checkpoint) {
      element.pause();
      // A corrective seek fires seeking/timeupdate again. At the boundary there is
      // nothing left to correct, so never assign currentTime recursively.
      if (element.currentTime > checkpoint.atSeconds + 0.05) element.currentTime = checkpoint.atSeconds;
      showCheckpoint(checkpoint.id);
    }
    remember();
  }

  function applyCaptions(enabled: boolean) {
    const element = video.current;
    if (!element) return;
    for (let i = 0; i < element.textTracks.length; i++) element.textTracks[i].mode = enabled && i === 0 ? 'showing' : 'disabled';
  }

  function metadataLoaded() {
    const element = video.current!;
    ready.current = true;
    const checkpoint = lesson.checkpoints.find(item => draft.current.answers[item.id] !== item.correctChoiceId);
    const requested = draft.current.position;
    const target = Math.min(requested, checkpoint?.atSeconds ?? lesson.durationSeconds);
    element.currentTime = target;
    element.playbackRate = Number(speed);
    applyCaptions(captions);
    setPosition(target);
    if (checkpoint && requested >= checkpoint.atSeconds) showCheckpoint(checkpoint.id);
    else if (target > 0) setStatus(`Ready at ${timestamp(target)}. Press Play to resume. Saved position is not proof of watching; review any missed sections or use the transcript to complete.`);
    draft.current.position = target;
  }

  function choose(checkpointId: string, choiceId: string) {
    video.current?.pause();
    const next = { ...draft.current.answers, [checkpointId]: choiceId };
    draft.current.answers = next;
    setAnswers(next);
  }

  function seekTo(seconds: number) {
    const element = video.current;
    if (!element || !ready.current) return;
    element.pause();
    element.currentTime = seconds;
    gate();
    element.focus();
  }

  function close() {
    if (saveLock.current) return;
    video.current?.pause();
    onClose(remember());
  }

  async function save(complete: boolean) {
    if (saveLock.current || busy || !writable || (complete && !canComplete)) return;
    saveLock.current = true;
    setPending(true); setSaveError('');
    video.current?.pause();
    const current = remember();
    // Snapshot before awaiting: playback events can never mutate the save payload.
    const payload: PlaybackDraft = { ...current, answers: { ...current.answers }, watched: [...current.watched] };
    try {
      if (!await onSave(lesson, payload, complete)) throw new Error('Your progress was not saved. Please try again.');
      if (mounted.current) {
        if (complete) setSavedCompletion(true);
        setStatus(complete ? 'Lesson completion saved.' : `Resume position ${timestamp(payload.position)} saved. Checkpoint answers and watched sections are kept only while this library stays open.`);
      }
    } catch (error) { if (mounted.current) setSaveError(errorText(error)); }
    finally { saveLock.current = false; if (mounted.current) setPending(false); }
  }

  const visibleCheckpoints = transcriptMode ? lesson.checkpoints : lesson.checkpoints.filter(item => item.id === activeCheckpoint);
  return <Dialog title={lesson.title} onClose={close} busy={pending}>
    <div className="video-player">
      <div><p className="eyebrow">{lesson.category} · {timestamp(lesson.durationSeconds)}</p><p>{lesson.summary}</p></div>
      <div className="video-stage"><video ref={video} src={lesson.video.src} poster={lesson.poster} controls playsInline preload="metadata" aria-label={lesson.title} aria-describedby={descriptionId}
        onLoadedMetadata={metadataLoaded} onTimeUpdate={gate} onSeeking={gate} onSeeked={gate}
        onPlay={() => { if (pending || transcriptMode) video.current?.pause(); else gate(); }} onPause={() => remember()}
        onEnded={() => {
          gate();
          const element = video.current;
          if (!element?.ended) return;
          draft.current.ended = true; setEnded(true);
          setStatus(watchedLesson(lesson, draft.current.watched) ? 'Video ended. Complete the checkpoint, then explicitly save completion.' : 'Video ended, but some sections were skipped. Review from the start or read the transcript before completing.');
        }}
        onRateChange={() => { if (video.current) setSpeed(String(video.current.playbackRate)); }}
        onError={() => { setMediaError('The video could not load or playback was interrupted. Retry the video, or use the full transcript below.'); }}>
        {lesson.subtitles.map((track, index) => <track key={track.src} src={track.src} kind={track.kind} srcLang={track.srcLang} label={track.label} default={index === 0} onLoad={() => applyCaptions(captions)} onError={() => setCaptionError(true)} />)}
        Your browser cannot play this MP4. Use the transcript below.
      </video></div>
      <p id={descriptionId} className="muted small">Native video controls support keyboard playback and seeking. The video pauses at {lesson.checkpoints.map(item => timestamp(item.atSeconds)).join(', ')}; seeking beyond an unanswered checkpoint is blocked. Captions start on.</p>
      <div className="row"><span className="video-duration">{timestamp(position)} / {timestamp(lesson.durationSeconds)}</span><label className="field">Playback speed<select aria-label="Playback speed" value={speed} disabled={pending} onChange={event => { setSpeed(event.target.value); if (video.current) video.current.playbackRate = Number(event.target.value); }}>{[0.75, 1, 1.25, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label><button type="button" className="btn secondary" aria-pressed={captions} onClick={() => { setCaptions(!captions); applyCaptions(!captions); }}>Captions {captions ? 'on' : 'off'}</button></div>
      <p role="status">{status}</p>
      {mediaError && <Notice error><span>{mediaError} </span><button type="button" className="btn secondary" disabled={pending} onClick={() => { remember(); ready.current = false; setMediaError(''); video.current?.load(); }}>Retry video</button></Notice>}
      {captionError && <Notice error>Captions could not load. Use the transcript for all narration and answer explanations.</Notice>}
      <div className="row"><button type="button" className="btn secondary" disabled={pending || transcriptMode} onClick={() => { active.current = null; setActiveCheckpoint(null); seekTo(0); setStatus('Returned to the start. Press Play to review missed sections.'); }}><RotateCcw size={16} aria-hidden="true" />Review from start</button><button type="button" className="btn secondary" aria-pressed={transcriptMode} disabled={pending} onClick={() => { video.current?.pause(); remember(); setTranscriptMode(!transcriptMode); }}>{transcriptMode ? 'Return to video' : 'Use accessible transcript'}</button></div>
      <details className="video-transcript" open={transcriptMode || undefined}><summary>Full transcript & answer explanations</summary><div className="stack">{transcript ? <div className="p-source-excerpt" role="region" aria-label="Lesson transcript" tabIndex={0}>{transcript}</div> : transcriptError ? <><Notice error>{transcriptError}</Notice><button type="button" className="btn secondary" onClick={() => setTranscriptAttempt(value => value + 1)}>Retry transcript</button></> : <p role="status">Loading local transcript…</p>}
        {transcriptMode && transcript && <label className="chip"><input type="checkbox" checked={transcriptRead} disabled={pending} onChange={event => { draft.current.transcriptRead = event.target.checked; setTranscriptRead(event.target.checked); }} />I have read the full transcript and explanations.</label>}
      </div></details>
      {visibleCheckpoints.map(checkpoint => {
        const choice = checkpoint.choices.find(item => item.id === answers[checkpoint.id]);
        const correct = choice?.id === checkpoint.correctChoiceId;
        return <section className="checkpoint" key={checkpoint.id} ref={checkpointPanel} tabIndex={-1} aria-labelledby={`${questionId}-${checkpoint.id}`}>
          <p className="eyebrow">Pause / reflect / continue</p><h3 id={`${questionId}-${checkpoint.id}`}>{checkpoint.prompt}</h3>
          <div className="checkpoint-choices" role="group" aria-label="Checkpoint answers">{checkpoint.choices.map(item => <button type="button" key={item.id} aria-pressed={choice?.id === item.id} disabled={pending} onClick={() => choose(checkpoint.id, item.id)}>{item.text}</button>)}</div>
          <p role="status">{choice ? `${correct ? 'Correct. ' : 'Not quite. '}${choice.feedback}` : 'Choose an answer to see its explanation.'}</p>
          <div className="row">{!transcriptMode && <button type="button" className="btn primary" disabled={!correct || pending} onClick={() => { active.current = null; setActiveCheckpoint(null); seekTo(checkpoint.resumeAtSeconds); setStatus('Checkpoint passed. Press Play to continue with the explanation.'); }}>Continue after checkpoint</button>}
            <button type="button" className="btn secondary" disabled={pending} onClick={() => { setTranscriptMode(false); active.current = null; setActiveCheckpoint(null); seekTo(checkpoint.replayFromSeconds); setStatus('Question segment ready. Press Play to replay.'); }}>Replay question segment</button></div>
        </section>;
      })}
      <details><summary>Sources & production details</summary><div className="stack"><p>Original {lesson.production.renderer} animation. Synthetic narration: {lesson.narration.voice}, generated offline using {lesson.narration.engine}. Caption phrase timing is approximate.</p><ul className="stack">{lesson.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.organization} — {source.title} (opens in a new tab)</a><p>{source.supports}</p><p className="muted small">Accessed {source.accessedOn}</p></li>)}</ul><p>Fictional examples for general education, not individual treatment advice. Clinical review pending: not clinically reviewed, with no clinician signoff. Source references do not imply endorsement of this lesson.</p></div></details>
      <div className="stack"><p className="muted small">{savedCompletion || completed ? 'This lesson is already saved as completed.' : transcriptMode ? 'To complete without video, read the full transcript, confirm intentionally, and answer the checkpoint correctly.' : 'To complete, watch all sections through the end and answer the checkpoint correctly. Seeking and opening the player never count as watching.'}</p>
        <p className="muted small">Close keeps your place only while this library stays open. Save progress stores your resume timestamp in this workspace; completion is saved only when you choose Mark lesson complete.</p>
        {!writable && <Notice>Read-only workspace: you can explore every lesson, but cannot save progress here.</Notice>}
        {saveError && <Notice error>{saveError}</Notice>}
        <div className="modal-actions"><button type="button" className="btn secondary" disabled={pending} onClick={close}>Close</button><button type="button" className="btn secondary" disabled={pending || busy || !writable} onClick={async () => { await save(false); }}>{pending ? 'Saving…' : 'Save progress'}</button><button type="button" className="btn primary" disabled={!canComplete || pending || busy || !writable || savedCompletion || completed} onClick={async () => { await save(true); }}>Mark lesson complete</button></div>
      </div>
    </div>
  </Dialog>;
}