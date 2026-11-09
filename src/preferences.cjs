const { randomUUID } = require('node:crypto');
const { readFile, rename, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const maxAvatarBytes = 64 * 1024 * 1024;

async function replaceFile(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function createPreferences(directory) {
  const voicePath = join(directory, 'voz.json');
  const avatarPath = join(directory, 'avatar-personal.vrm');

  async function getVoice() {
    try {
      return JSON.parse(await readFile(voicePath, 'utf8')) !== false;
    } catch {
      return true;
    }
  }

  async function setVoice(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('La preferencia de voz no es válida.');
    await replaceFile(voicePath, JSON.stringify(enabled));
  }

  async function saveAvatar(data) {
    if (!(data instanceof Uint8Array) || data.byteLength < 20 || data.byteLength > maxAvatarBytes) {
      throw new Error('El avatar debe ser un VRM de hasta 64 MB.');
    }
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 ||
        bytes.readUInt32LE(8) !== bytes.length) {
      throw new Error('El archivo no tiene una cabecera VRM válida.');
    }
    await replaceFile(avatarPath, bytes);
  }

  return { avatarPath, getVoice, setVoice, saveAvatar, resetAvatar: () => rm(avatarPath, { force: true }) };
}

module.exports = { createPreferences, replaceFile };
