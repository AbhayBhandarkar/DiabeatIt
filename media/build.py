"""Render, narrate locally, publish and verify the independent lesson bundle."""
import argparse
import hashlib
import importlib.metadata
import json
import platform
import subprocess
import sys
import textwrap
import wave
from datetime import datetime, timezone
from pathlib import Path

import av
import imageio_ffmpeg
from PIL import Image, ImageDraw
from manim import tempconfig
from scenes import IngredientOverlap, LabelPortions, UncertainIntake, GlucoseJourney

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
OUT = ROOT / "public" / "lessons"
BUILD = MEDIA / "build"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
DURATION = 48
FPS = 24


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def stamp(seconds: float) -> str:
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02}.{ms % 1000:03}"


def command(args: list[str]) -> None:
    result = subprocess.run(args, cwd=MEDIA, capture_output=True, text=True)
    with (BUILD / "commands.log").open("a", encoding="utf-8") as log:
        log.write(json.dumps(args) + "\n" + result.stdout + result.stderr + "\n")
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)


def audio_and_captions(lesson: dict) -> list[dict]:
    cues = []
    audio = bytearray(DURATION * 22050 * 2)
    for index, narration in enumerate(lesson["narration"]):
        file = BUILD / "audio" / f"{lesson['id']}-{index}.wav"
        with wave.open(str(file), "rb") as wav:
            assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (22050, 1, 2)
            frames = wav.readframes(wav.getnframes())
            duration = wav.getnframes() / 22050
        # Start after the incoming visual begins. Never truncate or speed up speech.
        assert duration <= 7.1, f"Narration too long: {lesson['id']} chapter {index}: {duration:.2f}s"
        start = index * 8 + 0.65
        if index == 3:
            assert start + duration < 31, "Checkpoint must follow its spoken question"
        offset = round(start * 22050) * 2
        audio[offset:offset + len(frames)] = frames
        # Phrase-level cues. Relative timing is proportional, not forced word alignment.
        words = narration.split()
        pieces = [words[i:i + 9] for i in range(0, len(words), 9)]
        consumed = 0
        for piece in pieces:
            cue_start = start + duration * consumed / len(words)
            consumed += len(piece)
            cue_end = start + duration * consumed / len(words)
            cues.append({"startSeconds": round(cue_start, 3), "endSeconds": round(cue_end, 3), "text": " ".join(piece)})
    with wave.open(str(BUILD / f"{lesson['id']}.wav"), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(audio)
    vtt = "WEBVTT\n\nNOTE Synthetic local Windows SAPI voice. Phrase timings are approximate.\n\n"
    for i, cue in enumerate(cues, 1):
        vtt += f"{i}\n{stamp(cue['startSeconds'])} --> {stamp(cue['endSeconds'])}\n"
        vtt += textwrap.fill(cue["text"], 48) + "\n\n"
    (OUT / f"{lesson['id']}.en.vtt").write_text(vtt, encoding="utf-8")
    return cues


def inspect(lesson: dict) -> dict:
    file = OUT / f"{lesson['id']}.mp4"
    samples = []
    with av.open(str(file)) as container:
        stream = container.streams.video[0]
        duration = float(stream.duration * stream.time_base)
        codec, pixel_format = stream.codec_context.name, stream.codec_context.format.name
        width, height = stream.width, stream.height
        frame_count = 0
        for frame in container.decode(video=0):
            if frame_count in [int(t * FPS) for t in (4, 12, 20, 28, 36, 44)]:
                samples.append(frame.to_image())
            frame_count += 1
    with av.open(str(file)) as container:
        audio_codec = container.streams.audio[0].codec_context.name
        audio_samples = sum(frame.samples for frame in container.decode(audio=0))
    assert frame_count == DURATION * FPS and abs(duration - DURATION) < 0.05
    assert (width, height, codec, pixel_format, audio_codec) == (1280, 720, "h264", "yuv420p", "aac")
    assert len(samples) == 6 and audio_samples > 22050 * 47
    assert len({hashlib.sha256(image.tobytes()).hexdigest() for image in samples}) == 6
    samples[0].save(OUT / f"{lesson['id']}.poster.jpg", quality=92)
    sheet = Image.new("RGB", (960, 600), "#0B1824")
    draw = ImageDraw.Draw(sheet)
    for index, image in enumerate(samples):
        image.thumbnail((480, 270))
        x, y = index % 2 * 480, index // 2 * 200
        # Preserve 16:9 at 320x180 with ample horizontal safe space.
        image = image.resize((320, 180))
        sheet.paste(image, (x, y + 20))
        draw.text((x + 5, y + 3), f"{lesson['id']} / {index * 8 + 4}s", fill="white")
    sheet.save(MEDIA / f"{lesson['id']}.contact.jpg", quality=94)
    command([FFMPEG, "-v", "error", "-i", str(file), "-f", "null", "-"])
    return {"id": lesson["id"], "durationSeconds": duration, "decodedFrames": frame_count,
            "width": width, "height": height, "fps": FPS, "videoCodec": codec,
            "pixelFormat": pixel_format, "audioCodec": audio_codec, "decodedAudioSamples": audio_samples,
            "fullDecodePassed": True, "distinctChapterFrames": 6,
            "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reuse-renders", action="store_true", help="Remux existing Manim renders without rerendering")
    parser.add_argument("--reuse-audio", action="store_true", help="Reuse offline narration WAV files")
    args = parser.parse_args()
    BUILD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((MEDIA / "lesson_data.json").read_text(encoding="utf-8"))
    sources = json.loads((MEDIA / "sources.json").read_text(encoding="utf-8"))
    if not args.reuse_audio:
        command(["pwsh", "-NoProfile", "-File", str(MEDIA / "narrate.ps1")])
    evidence, published = [], []
    for lesson, scene_type in zip(data, (IngredientOverlap, LabelPortions, UncertainIntake, GlucoseJourney), strict=True):
        cues = audio_and_captions(lesson)
        with tempconfig({"media_dir": str(BUILD / "manim"), "pixel_width": 1280, "pixel_height": 720,
                         "frame_rate": FPS, "output_file": lesson["id"], "disable_caching": True,
                         "write_to_movie": True, "preview": False, "verbosity": "WARNING"}):
            scene = scene_type()
            raw = Path(scene.renderer.file_writer.movie_file_path)
            if not args.reuse_renders:
                scene.render()
            assert raw.is_file(), f"Missing Manim render: {raw}"
        command([FFMPEG, "-y", "-i", str(raw), "-i", str(BUILD / f"{lesson['id']}.wav"),
                 "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-crf", "20",
                 "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                 "-movflags", "+faststart", "-t", str(DURATION), str(OUT / f"{lesson['id']}.mp4")])
        details = inspect(lesson)
        evidence.append(details)
        transcript = "\n\n".join(lesson["narration"])
        transcript += "\n\nCheckpoint: " + lesson["checkpoint"]["prompt"]
        for choice in lesson["checkpoint"]["choices"]:
            transcript += "\n- " + choice["text"] + " " + choice["feedback"]
        transcript += "\n\nSources:\n" + "\n".join(source["url"] for source in sources if source["id"] in lesson["sourceIds"])
        transcript += "\n\nGeneral education. No individual treatment advice or clinician signoff. Synthetic local Windows SAPI narration.\n"
        (OUT / f"{lesson['id']}.transcript.txt").write_text(transcript, encoding="utf-8")
        published.append({
            "id": lesson["id"], "title": lesson["title"], "category": lesson["category"], "summary": lesson["summary"],
            "language": "en", "durationSeconds": details["durationSeconds"],
            "video": {"src": f"/lessons/{lesson['id']}.mp4", "mimeType": "video/mp4", "width": 1280, "height": 720, "fps": FPS},
            "poster": f"/lessons/{lesson['id']}.poster.jpg",
            "subtitles": [{"src": f"/lessons/{lesson['id']}.en.vtt", "srcLang": "en", "label": "English", "kind": "subtitles"}],
            "transcript": f"/lessons/{lesson['id']}.transcript.txt",
            "narration": {"kind": "synthetic", "engine": "Windows SAPI (offline)", "voice": "Microsoft Zira Desktop - English (United States)", "rate": 1, "externalServiceUsed": False, "captionAlignment": "approximate-phrase"},
            "chapters": [{"startSeconds": i * 8, "endSeconds": (i + 1) * 8, "title": title} for i, title in enumerate(lesson["chapters"])],
            "checkpoints": [{**lesson["checkpoint"], "pausePlayback": True, "resumeAtSeconds": 32, "replayFromSeconds": 24}],
            "cues": cues, "sources": [s for s in sources if s["id"] in lesson["sourceIds"]],
            "safety": {"purpose": "general-education", "clinicalReview": "not-clinically-reviewed", "individualTreatmentAdvice": False, "fictionalExamples": True},
            "production": {"renderer": "Manim Community", "rendererVersion": importlib.metadata.version("manim"), "scene": scene_type.__name__, "sha256": details["sha256"]}
        })
        print(f"VERIFIED {lesson['id']}: {details['durationSeconds']} seconds, {details['decodedFrames']} frames", flush=True)
    write_json(OUT / "manifest.json", {"schemaVersion": 1, "lessons": published})
    schema = (MEDIA / "videoLessons.schema.txt").read_text(encoding="utf-8")
    (ROOT / "shared" / "videoLessons.ts").write_text(schema + "\nexport const videoLessons: readonly VideoLesson[] = " + json.dumps(published, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
    write_json(MEDIA / "validation.json", {"generatedAt": datetime.now(timezone.utc).isoformat(),
               "python": platform.python_version(), "manim": importlib.metadata.version("manim"),
               "ffmpeg": subprocess.check_output([FFMPEG, "-version"], text=True).splitlines()[0],
               "narration": "Local Windows SAPI; no external TTS service", "lessons": evidence})
    lock = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
    (MEDIA / "requirements-lock.txt").write_text(lock, encoding="utf-8")


if __name__ == "__main__":
    main()