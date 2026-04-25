"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState, useTransition, type ChangeEvent, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { upload, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type UploadedEvidence = {
  rootHash: `0x${string}`;
  txHash: string;
  size: number;
  label: string;
};

interface EvidenceUploaderProps {
  /** Optional. Omit for pre-tx uploads — the evidence row lands with a
   *  null assertion and should be attached via `attachEvidence` after
   *  the createEscrow / openDispute / claim tx lands on-chain. */
  assertionId?: `0x${string}`;
  uploader: `0x${string}`;
  onUploaded(evidence: UploadedEvidence): void;
  helper?: string;
}

/**
 * Drag-drop evidence uploader. Hits `POST /api/evidence` with
 * multipart/form-data — the field ORDER matters: uploader + optional
 * assertionId must land before the file part for busboy to surface them.
 */
export function EvidenceUploader({
  assertionId,
  uploader,
  onUploaded,
  helper,
}: EvidenceUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedEvidence | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick() {
    inputRef.current?.click();
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handle(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handle(file);
    e.target.value = "";
  }

  function handle(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large (50MB cap)");
      return;
    }

    start(async () => {
      const form = new FormData();
      // Fields FIRST — @fastify/multipart surfaces fields parsed BEFORE
      // the file. assertionId is optional; leave it off for pre-tx
      // uploads and attach later.
      if (assertionId) form.append("assertionId", assertionId);
      form.append("uploader", uploader);
      form.append("file", file, file.name);

      try {
        const res = await upload<{
          evidence: { rootHash: `0x${string}` };
          upload: { txHash: string; size: number };
        }>("/api/evidence", form);

        const result: UploadedEvidence = {
          rootHash: res.evidence.rootHash,
          txHash: res.upload.txHash,
          size: res.upload.size,
          label: file.name,
        };
        setUploaded(result);
        onUploaded(result);
        toast.success("Evidence uploaded to 0G Storage", {
          description: result.rootHash.slice(0, 18) + "…",
        });
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Upload failed";
        toast.error(message);
      }
    });
  }

  if (uploaded) {
    return (
      <div className="rounded-xl border border-green-400/30 bg-green-400/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-green-200">
              {uploaded.label}
            </div>
            <div className="font-mono text-xs text-white/60">
              {uploaded.rootHash}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploaded(null)}
            type="button"
          >
            Replace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onClick={pending ? undefined : onPick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-white/60 bg-white/[0.08]"
            : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]",
          pending && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="h-6 w-6 text-white/40" />
        <div className="text-sm text-white/70">
          {pending ? "Uploading to 0G Storage…" : "Drop a file or click to browse"}
        </div>
        <div className="text-xs text-white/40">{helper ?? "PDF, image, text, etc. up to 50MB"}</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={onChange}
      />
    </div>
  );
}
