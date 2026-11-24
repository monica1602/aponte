import { removeAttachment, uploadAttachment } from "@/lib/actions";
import { ACCEPT, ATTACH_TITLE_MAX, sizeLabel, type Attachment, type AttachScope } from "@/lib/attachments";
import { ReportForm } from "@/components/report-form";
import { btnSecondaryCls, inputCls } from "@/components/ui";

const when = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

export function AttachmentList({ items, removableIds = [], reportFor, ret, showOwner = false, empty = "Nenhum arquivo ainda." }: {
  items: Attachment[]; removableIds?: number[]; reportFor?: number | null; ret: string; showOwner?: boolean; empty?: string;
}) {
  if (items.length === 0) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
          {a.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/arquivos/${a.id}`} alt={a.title} className="h-16 w-16 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-raised text-xs font-semibold text-muted">PDF</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium [overflow-wrap:anywhere]">{a.title || a.filename}</p>
            <p className="text-xs text-muted">{showOwner && `${a.owner_name ?? "Conta excluida"} · `}{sizeLabel(a.size)} · {when(a.created_at)}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              <a href={`/arquivos/${a.id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">Ver</a>
              <a href={`/arquivos/${a.id}?baixar=1`} className="text-accent hover:underline">Baixar</a>
              {removableIds.includes(a.id) && (
                <form action={removeAttachment}><input type="hidden" name="attachment_id" value={a.id} /><button className="text-muted hover:text-red-300">Remover</button></form>
              )}
              {reportFor && reportFor !== a.owner_id ? <ReportForm type="attachment" id={a.id} ret={ret} label="Denunciar arquivo" /> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function UploadForm({ scope, targetId = 0, meetingKind, label = "Enviar arquivo", pdfOnly = false, withTitle = true }: {
  scope: AttachScope; targetId?: number; meetingKind?: string; label?: string; pdfOnly?: boolean; withTitle?: boolean;
}) {
  return (
    <form action={uploadAttachment} className="mt-3 space-y-2 rounded-xl border border-dashed border-line p-3">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="target_id" value={targetId} />
      {meetingKind && <input type="hidden" name="meeting_kind" value={meetingKind} />}
      <input type="file" name="file" required accept={pdfOnly ? "application/pdf" : ACCEPT} aria-label="Arquivo" className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-fg" />
      {withTitle && <input name="title" maxLength={ATTACH_TITLE_MAX} placeholder="Titulo (opcional)" aria-label="Titulo do arquivo" className={inputCls} />}
      <p className="text-xs text-muted">{pdfOnly ? "PDF" : "PDF, PNG, JPG ou WebP"}, com ate 2 MB. Nao envie documentos com dados sensiveis, como RG ou CPF.</p>
      <button className={btnSecondaryCls}>{label}</button>
    </form>
  );
}
