/**
 * Saves a generated text file.
 * Browser: triggers a download.
 * Native: writes to the app's Documents directory, then opens the share
 * sheet so the user can keep it in Files/Drive or send it.
 */
export async function saveTextFile(filename: string, content: string, mime: string): Promise<string> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    let uri: string;
    try {
      uri = (await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })).uri;
    } catch {
      uri = (await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })).uri;
    }
    try {
      const { Share } = await import("@capacitor/share");
      if ((await Share.canShare()).value) await Share.share({ title: filename, files: [uri] });
    } catch {
      /* user dismissed the share sheet — the file is still saved */
    }
    return `Saved to ${uri.includes("Documents") ? "Documents" : "app storage"} as ${filename}`;
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `Downloaded ${filename}`;
}
