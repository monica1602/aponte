import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createProject } from "@/lib/edu-actions";
import { AREAS, DIFFICULTIES, MODALITIES, OPPORTUNITY_TYPES, PROJECT_KINDS, TOOLS, WEEKLY_HOURS } from "@/lib/catalog";
import { ProjectKindVisibility } from "@/components/project-kind-visibility";
import { Card, CheckGroup, Field, Flash, PageHeader, SelectField, btnCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo projeto — Ponte" };

const KINDS_BY_ROLE: Record<string, (keyof typeof PROJECT_KINDS)[]> = {
  mentee: ["particular", "open_source"],
  mentor: ["open_source", "educacional"],
  company: ["empresarial", "educacional"],
};

const KIND_HELP: Record<string, string> = {
  particular: "Seu projeto de portfolio ou de estudo.",
  open_source: "Projeto com repositorio de codigo aberto.",
  educacional: "Projeto guiado para aprendizado em grupo.",
  empresarial: "Projeto real da empresa para formar talentos.",
};

export default async function NovoProjetoPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const kinds = KINDS_BY_ROLE[user.role];
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <PageHeader eyebrow="Projetos" title="Criar projeto" />
      <Flash params={sp} />
      <form action={createProject} className="space-y-6">
        <Card className="space-y-4">
          <ProjectKindVisibility kinds={kinds} help={KIND_HELP} />
          <Field label="Nome do projeto *"><input name="title" required minLength={3} maxLength={140} className={inputCls} /></Field>
          <Field label="Resumo curto"><input name="summary" maxLength={240} className={inputCls} /></Field>
          <Field label="Descricao *"><textarea name="description" required minLength={10} rows={4} className={inputCls} /></Field>
          <Field label="Objetivos de aprendizado"><textarea name="goals" rows={2} className={inputCls} /></Field>
          <Field label="Ajuda que voce precisa (opcional)"><input name="help_needed" className={inputCls} /></Field>
        </Card>
        <Card className="space-y-4">
          <CheckGroup legend="Ferramentas utilizadas *" name="tools" options={TOOLS} columns={4} />
          <CheckGroup legend="Areas" name="areas" options={AREAS} columns={3} />
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label="Nivel de dificuldade" name="difficulty" options={DIFFICULTIES} />
            <SelectField label="Tipo de oportunidade" name="opportunity_type" options={OPPORTUNITY_TYPES} />
            <SelectField label="Modalidade" name="modality" options={MODALITIES} />
            <SelectField label="Carga horaria semanal" name="weekly_hours" options={WEEKLY_HOURS} />
            <Field label="Inicio"><input name="starts_on" type="date" className={inputCls} /></Field>
            <Field label="Termino previsto"><input name="ends_on" type="date" className={inputCls} /></Field>
            <Field label="Vagas (opcional)"><input name="slots" type="number" min={1} max={500} className={inputCls} /></Field>
          </div>
          <Field label="Repositorio (obrigatorio para open source)"><input name="repo_url" type="text" inputMode="url" placeholder="github.com/usuario/projeto" className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="draft" /> Salvar como rascunho</label>
        </Card>
        <button className={`${btnCls} w-full sm:w-auto`}>Criar projeto</button>
      </form>
    </div>
  );
}
