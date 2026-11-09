"""Direct one reference voice in different emotions using local VoxCPM2."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"

DELIVERY = json.loads(Path(__file__).with_name("voice-delivery.json").read_text(encoding="utf-8"))

SAMPLES = {
    "dulce": "Qué bueno que llegaste. Ven, te estaba guardando un lugar.",
    "seria": "Guarda primero una copia. Después comprobamos que abra bien.",
    "feliz": "¿En serio? No pensé que hoy fuera a pasar esto.",
    "triste": "¿En serio? No pensé que hoy fuera a pasar esto.",
    "enojada": "¿En serio? No pensé que hoy fuera a pasar esto.",
    "timida": "¿En serio? No pensé que hoy fuera a pasar esto.",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("reference", type=Path)
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--tones", nargs="+", choices=SAMPLES, default=list(SAMPLES))
    args = parser.parse_args()
    if not args.serve and args.output is None:
        parser.error("an output directory is required")

    import numpy as np
    import soundfile as sf
    import torch
    from voxcpm import VoxCPM

    if not torch.cuda.is_available():
        raise RuntimeError("No se encontró CUDA para VoxCPM2")

    started = time.perf_counter()
    model = VoxCPM.from_pretrained(
        str(args.model.resolve()), load_denoiser=False, optimize=False, device="cuda",
    ).tts_model
    with torch.inference_mode():
        reference = model.build_prompt_cache(reference_wav_path=str(args.reference.resolve()))
    print(f"Modelo de emociones cargado en {time.perf_counter() - started:.1f} s", flush=True)

    def synthesize(tone, text, output, control=None):
        started = time.perf_counter()
        # The supplied audio anchors the speaker. The parenthetical text directs only the delivery.
        instruction = control or f"{DELIVERY['tones'][tone]} {DELIVERY['reference']}"
        torch.manual_seed(306)
        audio, _, _ = model.generate_with_prompt_cache(
            target_text=f"({instruction}){' '.join(text.split())}",
            prompt_cache=reference,
            cfg_value=2.0,
            inference_timesteps=10,
            max_len=256,
        )
        samples = audio.squeeze().float().cpu().numpy()
        peak = float(np.max(np.abs(samples)))
        if not np.isfinite(samples).all() or peak < 0.005:
            raise RuntimeError("Audio de voz inválido")
        samples *= min(1.0, 0.50 / peak)
        rate = model.sample_rate
        sf.write(output, samples, rate, subtype="PCM_16")
        print(f"{tone}: {len(samples) / rate:.2f} s de audio en {time.perf_counter() - started:.1f} s", flush=True)

    if args.serve:
        for line in sys.stdin:
            try:
                job = json.loads(line)
                synthesize(job["tone"], job["text"], job["output"], job.get("control"))
            except Exception as error:
                print(type(error).__name__, file=sys.stderr, flush=True)
                print("VRM_ERROR", flush=True)
            else:
                print("VRM_OK", flush=True)
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        for tone in args.tones:
            synthesize(tone, SAMPLES[tone], args.output / f"voz-joven-{tone}.wav")


if __name__ == "__main__":
    main()
