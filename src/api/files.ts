/** Browser-side file helpers that replace Electron's native open/save dialogs. */

export interface ExportFile {
  name: string
  mime: string
  content: string
}

export function downloadText(file: ExportFile): void {
  const blob = new Blob([file.content], { type: `${file.mime};charset=utf-8` })
  downloadBlob(blob, file.name)
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Open a file picker; resolves null if the user cancels. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    let settled = false
    const finish = (f: File | null): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(f)
    }
    input.onchange = () => finish(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
}

/** Open a folder picker (all files inside). Resolves [] if cancelled/unsupported. */
export function pickFolderFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.setAttribute('webkitdirectory', '')
    input.multiple = true
    input.style.display = 'none'
    let settled = false
    const finish = (files: File[]): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.onchange = () => finish(Array.from(input.files ?? []))
    input.addEventListener('cancel', () => finish([]))
    document.body.appendChild(input)
    input.click()
  })
}

export async function pickJson<T>(): Promise<T | null> {
  const f = await pickFile('.json,application/json')
  if (!f) return null
  return JSON.parse(await f.text()) as T
}

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

interface DirHandle {
  name: string
  getDirectoryHandle: (name: string, opts: { create: boolean }) => Promise<DirHandle>
  getFileHandle: (name: string, opts: { create: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
  }>
}

/**
 * Write several files into `<chosen dir>/<folder>/` using the File System Access API
 * (Chrome, Edge, Electron). Falls back to downloading each file when unavailable.
 * Returns a message for the user, or null if cancelled.
 */
export async function saveFolder(folder: string, files: ExportFile[]): Promise<string | null> {
  const picker = (window as unknown as { showDirectoryPicker?: (o?: unknown) => Promise<DirHandle> }).showDirectoryPicker
  if (picker) {
    let root: DirHandle
    try {
      root = await picker({ mode: 'readwrite' })
    } catch {
      return null // cancelled
    }
    const dir = await root.getDirectoryHandle(folder, { create: true })
    for (const f of files) {
      const h = await dir.getFileHandle(f.name, { create: true })
      const w = await h.createWritable()
      await w.write(f.content)
      await w.close()
    }
    return `Exportado para ${root.name}/${folder}`
  }
  for (const f of files) downloadText({ ...f, name: `${folder}__${f.name}` })
  return `${files.length} arquivos baixados (prefixo ${folder}__)`
}
