const video = document.querySelector('#video');
const panel = document.querySelector('#checkpoint');
const feedback = document.querySelector('#feedback');
const continueButton = document.querySelector('#continue');
const status = document.querySelector('#status');
let lesson;
let answered = false;
let completed = false;
let loading = false;

async function play() {
  try { await video.play(); }
  catch (error) {
    // A seek, lesson switch, or checkpoint pause can legitimately abort play().
    if (error.name === 'AbortError' || !panel.hidden) return;
    status.textContent = 'Press Play in the video controls to continue.';
  }
}

function gate() {
  if (loading || !lesson || completed) return;
  const checkpoint = lesson.checkpoints[0];
  if (video.currentTime >= checkpoint.atSeconds) {
    video.pause();
    if (video.currentTime > checkpoint.atSeconds + 0.15) video.currentTime = checkpoint.atSeconds;
    if (panel.hidden) {
      panel.hidden = false;
      status.textContent = 'Paused for your answer. Choose an option to see an explanation.';
      panel.focus({ preventScroll: true });
    }
  }
}

function reset() {
  answered = false;
  completed = false;
  panel.hidden = true;
  continueButton.disabled = true;
  feedback.textContent = '';
  document.querySelectorAll('#choices button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  status.textContent = 'The video pauses for a checkpoint at 00:31. Captions are available in the video controls.';
}

function select(item) {
  loading = true;
  video.pause();
  lesson = item;
  reset();
  document.querySelector('#title').textContent = item.title;
  document.querySelector('#category').textContent = item.category;
  document.querySelector('#summary').textContent = item.summary;
  video.replaceChildren();
  video.src = item.video.src;
  video.poster = item.poster;
  for (const subtitle of item.subtitles) {
    const track = document.createElement('track');
    track.kind = subtitle.kind;
    track.src = subtitle.src;
    track.srclang = subtitle.srcLang;
    track.label = subtitle.label;
    track.default = true;
    video.append(track);
  }
  video.load();
  document.querySelector('#transcript').href = item.transcript;
  document.querySelector('#download').href = item.video.src;
  const checkpoint = item.checkpoints[0];
  document.querySelector('#question').textContent = checkpoint.prompt;
  const choices = document.querySelector('#choices');
  choices.replaceChildren();
  checkpoint.choices.forEach(choice => {
    const button = document.createElement('button');
    button.textContent = choice.text;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      choices.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      feedback.textContent = choice.feedback;
      answered = true;
      continueButton.disabled = false;
    });
    choices.append(button);
  });
  const sources = document.querySelector('#sources');
  sources.replaceChildren();
  for (const source of item.sources) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = `${source.organization} — ${source.title}`;
    link.rel = 'noopener noreferrer';
    li.append(link, document.createTextNode(`. ${source.supports} Accessed ${source.accessedOn}.`));
    sources.append(li);
  }
  document.querySelectorAll('nav button').forEach(button => button.setAttribute('aria-current', String(button.dataset.id === item.id)));
  loading = false;
}

video.addEventListener('timeupdate', gate);
video.addEventListener('seeking', gate);
video.addEventListener('play', gate);
video.addEventListener('error', () => { status.textContent = 'The video could not load. Use the transcript link or check the local asset server.'; });
continueButton.addEventListener('click', () => {
  if (!answered) return;
  completed = true;
  panel.hidden = true;
  video.currentTime = lesson.checkpoints[0].resumeAtSeconds;
  status.textContent = 'Checkpoint explored. Continue with the explanation.';
  video.focus();
  void play();
});
document.querySelector('#replay').addEventListener('click', () => {
  reset();
  video.currentTime = lesson.checkpoints[0].replayFromSeconds;
  video.focus();
  void play();
});
document.querySelector('#restart').addEventListener('click', () => {
  reset();
  video.currentTime = 0;
  video.focus();
  void play();
});

try {
  const response = await fetch('./manifest.json');
  if (!response.ok) throw new Error('Manifest request failed');
  const { lessons } = await response.json();
  const nav = document.querySelector('#lessons');
  lessons.forEach((item, index) => {
    const button = document.createElement('button');
    button.textContent = `0${index + 1} / ${item.title}`;
    button.dataset.id = item.id;
    button.addEventListener('click', () => select(item));
    nav.append(button);
  });
  select(lessons[0]);
} catch {
  document.querySelector('#title').textContent = 'Lessons could not load';
  status.textContent = 'Open this preview through a local HTTP server, not as a file URL. Check that manifest.json and the rendered media exist.';
}