"use client";

import { useRef, useState } from "react";
import { api, dateTime, useApi } from "@/lib/api";
import { Empty, ErrorBox, Loading } from "@/components/ui";

interface Doc {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
}

interface UploadLink {
  key: string;
  name: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresIn: number;
}

const MAX_MB = 50;

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * PUT the file straight to S3 with the signed link, reporting progress. The file never goes
 * through the dashboard's server, so there's no 4.5 MB limit.
 */
function putToS3(link: UploadLink, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(link.method, link.url);
    for (const [name, value] of Object.entries(link.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(xhr.status === 403 ? "The upload link expired or was refused. Try again." : `Storage refused the upload (${xhr.status}). Try again.`));
    // status 0: the browser blocked it, which with S3 almost always means the bucket's CORS rules
    xhr.onerror = () => reject(new Error("The upload couldn't reach document storage. Check your connection; if it keeps failing, the bucket's CORS settings must allow this site."));
    xhr.send(file);
  });
}

export default function DocumentsPage() {
  const list = useApi<{ items: Doc[] }>("/api/documents");
  const input = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<Doc | null>(null);
  const [upload, setUpload] = useState<{ name: string; progress: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Doc | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const choose = (doc: Doc | null) => {
    setReplacing(doc);
    setMessage(null);
    input.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setMessage({ kind: "error", text: "Only PDF files can be uploaded." });
    }
    if (file.size > MAX_MB * 1024 * 1024) return setMessage({ kind: "error", text: `PDFs can be up to ${MAX_MB} MB; this one is ${size(file.size)}.` });
    const target = replacing;
    setUpload({ name: file.name, progress: 0 });
    try {
      const link = await api<UploadLink>("/api/documents", {
        method: "POST",
        body: { fileName: file.name, size: file.size, contentType: "application/pdf", ...(target ? { key: target.key } : {}) },
      });
      await putToS3(link, file, (progress) => setUpload({ name: file.name, progress }));
      setMessage({ kind: "ok", text: target ? `Replaced ${target.name}.` : `Uploaded ${link.name}.` });
      list.reload();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setUpload(null);
      setReplacing(null);
    }
  };

  const open = async (doc: Doc) => {
    // open the tab now, while the click still counts, so pop-up blockers allow it
    const tab = window.open("about:blank", "_blank");
    setBusyKey(doc.key);
    try {
      const { url } = await api<{ url: string }>("/api/documents", { method: "PATCH", body: { key: doc.key } });
      if (tab) {
        tab.opener = null;
        tab.location.assign(url);
      } else {
        // pop-ups blocked: open it here instead
        window.location.assign(url);
      }
    } catch (e) {
      tab?.close();
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (doc: Doc) => {
    setBusyKey(doc.key);
    try {
      await api(`/api/documents?key=${encodeURIComponent(doc.key)}`, { method: "DELETE" });
      setMessage({ kind: "ok", text: `Deleted ${doc.name}. It can be restored for 30 days.` });
      list.reload();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusyKey(null);
      setConfirmDelete(null);
    }
  };

  const button = "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-foreground-muted mt-0.5">PDFs kept in document storage. Upload, replace, open or delete them.</p>
        </div>
        <button disabled={Boolean(upload)} onClick={() => choose(null)} className={`${button} bg-accent text-white font-semibold hover:bg-accent-dim self-start`}>
          Upload PDF
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {upload && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4" role="status">
          <p className="text-sm text-foreground mb-2">
            {replacing ? `Replacing ${replacing.name} with ` : "Uploading "}
            {upload.name}… {Math.round(upload.progress * 100)}%
          </p>
          <div className="h-2 w-full rounded-full bg-surface-raised overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(upload.progress * 100)}%` }} />
          </div>
        </div>
      )}
      {message && (
        <div className="mb-6">
          {message.kind === "error" ? (
            <ErrorBox message={message.text} />
          ) : (
            <p className="rounded-xl border border-success/30 bg-success/10 px-5 py-3 text-sm text-foreground" role="status">
              {message.text}
            </p>
          )}
        </div>
      )}

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading label="Loading documents…" />}
      {list.data && list.data.items.length === 0 && <Empty>No documents yet. Use “Upload PDF” to add one.</Empty>}

      {list.data && list.data.items.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          {list.data.items.map((doc, i, all) => (
            <div key={doc.key} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 ${i < all.length - 1 ? "border-b border-border" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                <p className="text-xs text-foreground-dim mt-0.5">
                  {size(doc.size)}
                  {doc.lastModified && ` · updated ${dateTime(doc.lastModified)}`}
                </p>
              </div>
              {confirmDelete?.key === doc.key ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-foreground-muted">Delete it? It can be restored for 30 days.</span>
                  <button disabled={busyKey === doc.key} onClick={() => remove(doc)} className={`${button} bg-p1 text-white font-semibold`}>
                    {busyKey === doc.key ? "Deleting…" : "Delete"}
                  </button>
                  <button onClick={() => setConfirmDelete(null)} className={`${button} border border-border text-foreground-muted hover:text-foreground`}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={busyKey === doc.key} onClick={() => open(doc)} className={`${button} bg-accent/10 text-accent hover:bg-accent/15`}>
                    {busyKey === doc.key ? "Opening…" : "Open"}
                  </button>
                  <button disabled={Boolean(upload)} onClick={() => choose(doc)} className={`${button} border border-border text-foreground-muted hover:text-foreground`}>
                    Replace
                  </button>
                  <button onClick={() => setConfirmDelete(doc)} className={`${button} text-p1 hover:bg-p1/10`}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
