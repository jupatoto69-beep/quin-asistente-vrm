"""Generate local auditions for an original Spanish speaking voice."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"

IDENTITY = (
    "A young adult woman in her early twenties, a native Latin American Spanish speaker "
    "with a light Colombian inflection. A light, clear, warm voice with gentle brightness, "
    "speaking at close conversational distance. Natural chest and head resonance, clear vowels, "
    "and easy transitions between notes. Keep a comfortable speaking pitch and use an intimate, "
    "unhurried conversational delivery."
)

DELIVERY = {
    "dulce": "Genuinely glad to talk to a friend, with a soft smile and an interested tone. "
             "Give questions a gentle rise. Take a small natural beat at a marked hesitation.",
    "picara": "Playful dry wit among friends. Sound amused and spontaneous. Leave a short "
              "quiet beat before the punchline and emphasize it lightly, with a small smile.",
    "seria": "Calm and direct, like helping a friend solve a real problem. Clear emphasis "
             "on important words, short deliberate pauses between ideas, and a soft ending.",
    "feliz": "Delighted, light and smiling, with a quick lively rhythm and natural rising intonation.",
    "triste": "Soft and genuinely sad, a little slower with pauses and a falling voice.",
    "enojada": "Irritated and firm, with clipped emphasis. Keep the volume conversational.",
    "timida": "Shy and slightly nervous, with a soft voice, a little hesitation and a gentle rise.",
}

AUDITIONS = {
    "dulce": "Hola. Qué bueno que llegaste… A ver, cuéntame cómo te fue hoy.",
    "picara": "Uy… le pedí al computador un poquito de espacio. Y me vació la papelera. Qué detallazo, ¿no?",
    "seria": "Mira, lo primero es guardar una copia. Después comprobamos que abra bien.",
}


def main():
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--tones", nargs="+", choices=AUDITIONS, default=list(AUDITIONS))
    parser.add_argument("--say", choices=DELIVERY, help="Read the line from stdin and write one WAV")
    parser.add_argument("--accelerated", action="store_true")
    parser.add_argument("--serve", action="store_true", help="Read synthesis jobs from stdin")
    args = parser.parse_args()
    if not args.serve and args.output is None:
        parser.error("an output path is required")
    if not torch.cuda.is_available():
        raise RuntimeError("No se encontró CUDA para la prueba de voz")
    if args.serve:
        jobs = ()
    elif args.say:
        jobs = [(args.say, sys.stdin.read().strip(), args.output)]
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        jobs = [(tone, AUDITIONS[tone], args.output / f"voz-joven-{tone}.wav") for tone in args.tones]

    started = time.perf_counter()
    model_path = str(args.model.resolve())
    if args.accelerated:
        from faster_qwen3_tts import FasterQwen3TTS

        model = FasterQwen3TTS.from_pretrained(
            model_path, device="cuda:0", dtype=torch.bfloat16,
            attn_implementation="sdpa", local_files_only=True,
        )
    else:
        model = Qwen3TTSModel.from_pretrained(
            model_path, device_map="cuda:0", dtype=torch.bfloat16,
            attn_implementation="sdpa", local_files_only=True,
        )
    print(f"Modelo cargado en {time.perf_counter() - started:.1f} s", flush=True)
    torch.manual_seed(306)
    def synthesize(tone, text, output):
        started = time.perf_counter()
        wavs, rate = model.generate_voice_design(
            text=text,
            language="Spanish",
            instruct=f"{IDENTITY} {DELIVERY[tone]} Read the supplied Spanish words as written.",
            max_new_tokens=512 if args.say or args.serve else 260,
        )
        samples = np.asarray(wavs[0], dtype=np.float32)
        peak = float(np.max(np.abs(samples)))
        if not np.isfinite(samples).all() or peak < 0.005:
            raise RuntimeError(f"Audio inválido para {tone}")
        samples *= min(1.0, 0.50 / peak)
        sf.write(output, samples, rate, subtype="PCM_16")
        print(f"{tone}: {len(samples) / rate:.2f} s de audio en {time.perf_counter() - started:.1f} s", flush=True)

    for tone, text, output in jobs:
        synthesize(tone, text, output)
    if args.serve:
        for line in sys.stdin:
            try:
                job = json.loads(line)
                synthesize(job["tone"], job["text"], job["output"])
            except Exception as error:
                print(type(error).__name__, file=sys.stderr, flush=True)
                print("VRM_ERROR", flush=True)
            else:
                print("VRM_OK", flush=True)


if __name__ == "__main__":
    main()
