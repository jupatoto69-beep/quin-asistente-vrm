export function visionCommand(text) {
  const match = /^\s*[¿¡]?(?:(?:(?:oye|olle|hey)[,.!:\s]+)?(?:quin[n]?|queen|kin|kim|keane)[,.!:\s]+)?[¿¡]?mira\s+(?:esto|(?:mi|la) pantalla)(?=$|[\s,.!?:…])(.*)$/isu.exec(text);
  if (match) return match[1].replace(/^[\s,.!?:…]+/u, '').trim();
  const guide = /^\s*[¿¡]?(?:(?:(?:oye|olle|hey)[,.!:\s]+)?quin[,.!:\s]+)?(gu[ií]ame (?:en (?:esta|mi|la) pantalla|sobre este recorte)(?:[,.!?:…\s]+.*)?)$/isu.exec(text);
  return guide?.[1];
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function grabFrame(stream) {
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  let timer;
  try {
    await Promise.race([
      video.play(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('La fuente no entregó una imagen. Prueba otra ventana.')), 6000);
      }),
    ]);
    if (!video.videoWidth || !video.videoHeight) throw new Error('La fuente no entregó una imagen.');
    return await createImageBitmap(video);
  } finally {
    clearTimeout(timer);
    video.pause();
    video.srcObject = null;
  }
}

export function createVisionPanel(api, { available, onOpen, onClose, analyze, onPoint, onStep }) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('vision-dialog');
  const source = byId('vision-source');
  const refresh = byId('vision-refresh');
  const capture = byId('vision-capture');
  const canvas = byId('vision-canvas');
  const controls = byId('vision-select-controls');
  const crop = byId('vision-crop');
  const full = byId('vision-full');
  const form = byId('vision-ask');
  const question = byId('vision-question');
  const submit = byId('vision-analyze');
  const status = byId('vision-status');
  const result = byId('vision-result');
  const guide = byId('vision-guide');
  const stepText = byId('vision-step');
  const previous = byId('vision-prev');
  const next = byId('vision-next');
  let epoch = 0;
  let busy = false;
  let stream;
  let frame;
  let confirmed;
  let drag;
  let selection;
  let mark;
  let steps = [];
  let stepIndex = 0;

  function sync() {
    refresh.disabled = busy || !available();
    source.disabled = refresh.disabled;
    capture.disabled = refresh.disabled || !source.value;
    crop.disabled = busy || !selection || selection.width < 24 || selection.height < 24;
    full.disabled = busy;
    submit.disabled = busy;
    previous.disabled = busy || stepIndex === 0;
    next.disabled = busy || stepIndex >= steps.length - 1;
  }

  function resetGuide() {
    mark = undefined;
    steps = [];
    stepIndex = 0;
    guide.hidden = true;
    document.body.classList.remove('vision-guiding');
    dialog.classList.remove('guiding');
  }

  function clearImage() {
    frame?.close();
    confirmed?.image.close?.();
    frame = confirmed = drag = selection = undefined;
    canvas.width = canvas.height = 1;
    canvas.classList.remove('selecting');
    canvas.parentElement.hidden = controls.hidden = form.hidden = true;
    result.textContent = '';
    resetGuide();
  }

  function draw(box) {
    const image = confirmed?.image ?? frame;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    ctx.strokeStyle = '#ffdc80';
    ctx.lineWidth = Math.max(3, canvas.width / 240);
    if (frame && selection) {
      const { x, y, width, height } = selection;
      ctx.fillStyle = '#0008';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, x, y, width, height, x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    }
    if (box) {
      const [left, top, right, bottom] = box.map((value) => value / 1000);
      ctx.strokeRect(left * canvas.width, top * canvas.height,
        (right - left) * canvas.width, (bottom - top) * canvas.height);
    }
  }

  function showMark(box) {
    mark = box;
    const guiding = !!mark || steps.length > 0;
    document.body.classList.toggle('vision-guiding', guiding);
    dialog.classList.toggle('guiding', guiding);
    draw(mark);
    if (mark) {
      const revision = epoch;
      requestAnimationFrame(() => { if (current(revision) && mark === box) onPoint(); });
    }
  }

  function pointPosition() {
    if (!dialog.open || !mark) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const x = (mark[0] + mark[2]) / 2000;
    const y = (mark[1] + mark[3]) / 2000;
    return { x: rect.left + rect.width / 2 + (x - 0.5) * canvas.width * scale,
      y: rect.top + rect.height / 2 + (y - 0.5) * canvas.height * scale };
  }

  function showStep() {
    const step = steps[stepIndex];
    stepText.textContent = `Paso ${stepIndex + 1} de ${steps.length}. ${step.text}`;
    showMark(step.box);
    status.textContent = step.box ? 'Marca aproximada sobre el recorte.' : 'Sigue el paso indicado.';
    return step.text;
  }

  async function changeStep(offset) {
    if (busy || !steps[stepIndex + offset]) return;
    const revision = epoch;
    busy = true;
    stepIndex += offset;
    sync();
    try { await onStep(showStep(), stepText); }
    catch (error) { if (current(revision)) showError(error); }
    finally { if (current(revision)) { busy = false; sync(); } }
  }

  previous.addEventListener('click', () => changeStep(-1));
  next.addEventListener('click', () => changeStep(1));

  function showImage(image) {
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.parentElement.hidden = false;
    draw();
  }

  const current = (revision) => dialog.open && revision === epoch;
  function showError(error) {
    status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  }

  async function listSources() {
    const revision = epoch;
    busy = true;
    sync();
    status.textContent = 'Buscando pantallas y ventanas…';
    try {
      const choices = await api.visionSources();
      if (!current(revision)) return;
      source.replaceChildren(...choices.map(({ id, name }) => new Option(name, id)));
      status.textContent = choices.length ? 'Pulsa «Capturar vista» cuando la escena esté lista.' : 'No hay fuentes disponibles.';
    } catch (error) {
      if (current(revision)) showError(error);
    } finally {
      if (current(revision)) { busy = false; sync(); }
    }
  }

  async function open(text = '', command) {
    if (dialog.open) return;
    const revision = ++epoch;
    clearImage();
    source.replaceChildren();
    question.value = text.slice(0, 500);
    busy = true;
    dialog.showModal();
    onOpen();
    sync();
    try {
      await api.visionPanel(true);
      if (!current(revision)) return;
      if (!available()) {
        status.textContent = 'Instala el modelo local con scripts\\Preparar-Vision.ps1 y vuelve a abrir Quin.';
      } else if (command) {
        status.textContent = 'Capturando tu pantalla…';
        const jpeg = await api.captureScreen(command);
        if (!current(revision)) return;
        const blob = new Blob([jpeg], { type: 'image/jpeg' });
        const image = await createImageBitmap(blob);
        if (!current(revision)) { image.close(); return; }
        confirmed = { image, blob, fullScreen: true };
        showImage(image);
        form.hidden = false;
        await analyzeConfirmed(revision);
      } else await listSources();
    } catch (error) {
      if (current(revision)) showError(error);
    } finally {
      if (current(revision)) { busy = false; sync(); }
    }
  }

  capture.addEventListener('click', async () => {
    if (busy || !source.value) return;
    const revision = epoch;
    busy = true;
    clearImage();
    sync();
    status.textContent = 'Capturando un instante…';
    let active;
    try {
      await api.authorizeVision(source.value);
      if (!current(revision)) return;
      active = await navigator.mediaDevices.getDisplayMedia({
        audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 5 } },
      });
      if (!current(revision)) return;
      stream = active;
      const captured = await grabFrame(active);
      if (!current(revision)) { captured.close(); return; }
      frame = captured;
      showImage(frame);
      canvas.classList.add('selecting');
      controls.hidden = false;
      status.textContent = 'Arrastra sobre la imagen para encuadrar lo que le quieres mostrar.';
    } catch (error) {
      if (current(revision)) showError(error);
    } finally {
      stopStream(active);
      if (stream === active) stream = undefined;
      if (current(revision)) { busy = false; sync(); }
    }
  });

  function pixel(event) {
    const box = canvas.getBoundingClientRect();
    const coordinate = (position, start, length, size) => Math.round(Math.max(0, Math.min(1, (position - start) / length)) * size);
    return {
      x: coordinate(event.clientX, box.left, box.width, canvas.width),
      y: coordinate(event.clientY, box.top, box.height, canvas.height),
    };
  }

  function select(event) {
    if (event.pointerId !== drag?.id) return;
    const end = pixel(event);
    selection = {
      x: Math.min(drag.x, end.x), y: Math.min(drag.y, end.y),
      width: Math.abs(end.x - drag.x), height: Math.abs(end.y - drag.y),
    };
    if (selection.width && selection.height) draw();
    sync();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (busy || !frame || event.button !== 0) return;
    drag = { ...pixel(event), id: event.pointerId };
    selection = undefined;
    canvas.setPointerCapture(event.pointerId);
    draw();
    sync();
  });
  canvas.addEventListener('pointermove', select);
  canvas.addEventListener('pointerup', (event) => { select(event); drag = undefined; });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; });

  async function confirm(rect) {
    if (!frame || !rect || busy) return;
    const revision = epoch;
    busy = true;
    sync();
    try {
      const image = document.createElement('canvas');
      const scale = Math.min(1, 1440 / Math.max(rect.width, rect.height));
      image.width = Math.max(1, Math.round(rect.width * scale));
      image.height = Math.max(1, Math.round(rect.height * scale));
      image.getContext('2d').drawImage(frame, rect.x, rect.y, rect.width, rect.height, 0, 0, image.width, image.height);
      const blob = await new Promise((resolve) => image.toBlob(resolve, 'image/jpeg', 0.93));
      if (!current(revision)) return;
      if (!blob) throw new Error('No pude preparar el recorte.');
      frame.close();
      frame = selection = undefined;
      confirmed = { image, blob };
      showImage(image);
      canvas.classList.remove('selecting');
      controls.hidden = true;
      form.hidden = false;
      status.textContent = 'Solo esta vista previa llegará al modelo local al pulsar «Analizar recorte».';
      question.focus();
    } catch (error) {
      if (current(revision)) showError(error);
    } finally {
      if (current(revision)) { busy = false; sync(); }
    }
  }

  crop.addEventListener('click', () => confirm(selection));
  full.addEventListener('click', () => frame && confirm({ x: 0, y: 0, width: frame.width, height: frame.height }));
  refresh.addEventListener('click', listSources);
  source.addEventListener('change', () => { clearImage(); sync(); });
  async function analyzeConfirmed(revision) {
    result.textContent = '';
    resetGuide();
    draw();
    const screen = confirmed.fullScreen;
    status.textContent = screen ? 'Quin está mirando la captura…' : 'Quin está mirando el recorte…';
    const image = new Uint8Array(await confirmed.blob.arrayBuffer());
    if (!current(revision)) return;
    const request = question.value.trim() || (screen ? '¿Qué ves en esta captura de mi pantalla?' : '¿Qué ves en este recorte?');
    await analyze(request, image, (answer) => {
      if (!current(revision)) return false;
      result.textContent = answer.text;
      steps = answer.steps ?? [];
      if (steps.length) {
        guide.hidden = false;
        showStep();
      } else {
        showMark(answer.box);
        status.textContent = answer.box ? `Marca aproximada sobre ${screen ? 'la captura' : 'el recorte'}.`
          : `Listo. Puedes preguntar algo más sobre ${screen ? 'esta captura' : 'este recorte'}.`;
      }
      return true;
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !confirmed) return;
    const revision = epoch;
    busy = true;
    sync();
    try {
      await analyzeConfirmed(revision);
    } catch (error) {
      if (current(revision)) showError(error);
    } finally {
      if (current(revision)) { busy = false; sync(); }
    }
  });
  dialog.addEventListener('close', () => {
    epoch++;
    stopStream(stream);
    stream = undefined;
    clearImage();
    api.visionPanel(false).catch(showError);
    onClose();
  });
  return { open, pointPosition };
}
