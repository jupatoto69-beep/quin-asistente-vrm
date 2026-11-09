import sys
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx


def main():
    directory, output, speed, pauses = sys.argv[1:]
    model = Path(directory)
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=str(model / "model.int8.onnx"),
                voices=str(model / "voices.bin"),
                tokens=str(model / "tokens.txt"),
                data_dir=str(model / "espeak-ng-data"),
                lang="es",
            ),
            provider="cpu",
            num_threads=4,
        )
    )
    if not config.validate():
        raise RuntimeError("Configuración de Kokoro incompleta")

    tts = sherpa_onnx.OfflineTts(config)
    voice = sherpa_onnx.GenerationConfig()
    voice.sid = 28  # ef_dora in the multilingual Kokoro v1.0 voice table.
    voice.speed = float(speed)
    voice.silence_scale = float(pauses)
    audio = tts.generate(sys.stdin.read().strip(), voice)
    if not len(audio.samples):
        raise RuntimeError("Kokoro no generó audio")

    # This checkpoint produces narrow tones at one fifth and two fifths of its sample rate.
    samples = np.asarray(audio.samples)
    frequencies = np.fft.rfftfreq(len(samples), 1 / audio.sample_rate)
    spectrum = np.fft.rfft(samples)
    for fraction in (0.2, 0.4):
        offset = (frequencies - audio.sample_rate * fraction) / 24
        spectrum *= 1 - np.exp(-0.5 * offset**2)
    filtered = np.fft.irfft(spectrum, n=len(samples))
    samples = (np.clip(filtered, -1, 1) * 32767).astype("<i2")
    with wave.open(output, "wb") as wav:
        wav.setparams((1, 2, audio.sample_rate, 0, "NONE", "not compressed"))
        wav.writeframes(samples.tobytes())


if __name__ == "__main__":
    main()
