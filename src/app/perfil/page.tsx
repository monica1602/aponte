import { bareUrl } from "@/lib/url";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getProfile, profileCompleteness } from "@/lib/db";
import { saveDetailedProfile } from "@/lib/edu-actions";
import { deleteAccount } from "@/lib/actions";
import {
  AREAS, COMPANY_TYPES, HELP_TYPES, MENTEE_LEVELS, MENTOR_LEVELS, MODALITIES, NO_TOOLS, PERIODS, SECTORS,
  SESSION_DURATIONS, TOOLS, UFS, WEEKDAYS, WEEKLY_HOURS,
} from "@/lib/catalog";
import { AttachmentList, UploadForm } from "@/components/attachments";
import { listAttachments } from "@/lib/attachments";
import { signatureFont } from "@/lib/fonts";
import { Card, CheckGroup, Field, Flash, PageHeader, ROLE_LABELS, SelectField, btnCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meu perfil — Ponte" };

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/primeiro-acesso");
  const p = await getProfile(user.id);
  const [resume, files] = await Promise.all([listAttachments({ scope: "resume", ownerId: user.id }), listAttachments({ scope: "profile", ownerId: user.id })]);
  const completeness = Math.round(profileCompleteness(p, user.role) * 100);
  const isCompany = user.role === "company";
  const isMentor = user.role === "mentor";

  return (
    <div className="pb-10">
      <PageHeader eyebrow={`Perfil de ${ROLE_LABELS[user.role]}`} title="Meu perfil">
        Estas informacoes sao usadas no calculo de compatibilidade. Perfil {completeness}% completo.{" "}
        <Link href={`/pessoas/${user.id}`} className="text-accent hover:underline">Ver perfil publico</Link>
      </PageHeader>
      <Flash params={sp} />
      <form action={saveDetailedProfile} className="space-y-6">
        <Card className="space-y-4">
          <h2 className="font-semibold">{isCompany ? "Dados da empresa" : "Apresentacao"}</h2>
          <Field label={isCompany ? "Resumo da empresa" : "Resumo profissional"}>
            <input name="headline" defaultValue={user.headline} maxLength={160} className={inputCls} />
          </Field>
          <Field label={isCompany ? "Descricao da empresa" : "Sobre voce"}>
            <textarea name="bio" rows={3} defaultValue={user.bio} className={inputCls} />
          </Field>
          {isCompany && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Tipo de empresa" name="companyType" options={COMPANY_TYPES} value={p.companyType} />
              <SelectField label="Setor de atuacao" name="sector" options={SECTORS} value={p.sector} />
              <Field label="Pessoa responsavel *"><input name="responsible" required defaultValue={p.responsible} className={inputCls} /></Field>
              <Field label="Cargo da pessoa responsavel"><input name="responsibleRole" defaultValue={p.responsibleRole} className={inputCls} /></Field>
              <Field label="Site"><input name="website" type="text" inputMode="url" placeholder="empresa.com.br" defaultValue={bareUrl(p.website)} className={inputCls} /></Field>
              <Field label="CNPJ (opcional)"><input name="cnpj" inputMode="numeric" defaultValue={p.cnpj} className={inputCls} /></Field>
              <Field label="Telefone (opcional)"><input name="phone" type="tel" autoComplete="tel" defaultValue={p.phone} className={inputCls} /></Field>
              <Field label="Numero de colaboradores"><input name="companySize" defaultValue={p.companySize} className={inputCls} /></Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Cidade"><input name="city" defaultValue={p.city} className={inputCls} /></Field>
            <SelectField label="Estado" name="state" options={UFS} value={p.state} placeholder="UF" />
          </div>
          {!isCompany && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="LinkedIn (opcional)"><input name="linkedin" type="text" inputMode="url" placeholder="linkedin.com/in/seu-nome" defaultValue={bareUrl(p.linkedin)} className={inputCls} /></Field>
              <Field label="GitHub (opcional)"><input name="github" type="text" inputMode="url" placeholder="github.com/seu-usuario" defaultValue={bareUrl(p.github)} className={inputCls} /></Field>
              <Field label="Portfolio (opcional)"><input name="portfolio" type="text" inputMode="url" placeholder="seusite.com" defaultValue={bareUrl(p.portfolio)} className={inputCls} /></Field>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input name="show_email" type="checkbox" defaultChecked={Boolean(user.show_email)} className="mt-1" />
            <span>
              Mostrar meu e-mail para todos os cadastrados
              <span className="block text-xs text-muted">Desligado, seu e-mail aparece so para quem tem mentoria, vinculo de empresa ou projeto ativo com voce.</span>
            </span>
          </label>
          {(isMentor || isCompany) && (
            <Field label="Assinatura nos certificados" hint="Aparece em letra cursiva, acima da linha, nos certificados dos eventos que voce cadastrar. Deixe vazio para nao usar.">
              <input name="signature_name" defaultValue={user.signature_name ?? user.name} maxLength={60} className={inputCls} />
              {(user.signature_name ?? user.name) && (
                <p className={`${signatureFont.className} mt-2 text-3xl`}>{user.signature_name ?? user.name}</p>
              )}
            </Field>
          )}
        </Card>

        {!isCompany && (
          <>
            <Card className="space-y-5">
              <h2 className="font-semibold">Ferramentas e areas</h2>
              <CheckGroup
                legend={isMentor ? "Ferramentas que voce domina *" : "Ferramentas que voce ja conhece"}
                name="tools" options={TOOLS} selected={p.tools} columns={4}
              />
              {!isMentor && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" name="noTools" defaultChecked={!p.tools?.length && !!p.learnTools?.length} /> {NO_TOOLS}
                </label>
              )}
              <Field label="Outras ferramentas"><input name="toolsOther" defaultValue={p.toolsOther} className={inputCls} /></Field>
              {!isMentor && <CheckGroup legend="Ferramentas que voce quer aprender" name="learnTools" options={TOOLS} selected={p.learnTools} columns={4} />}
              <CheckGroup
                legend={isMentor ? "Tipos de projeto com que voce atua" : "Areas de interesse"}
                name="areas" options={AREAS} selected={p.areas} columns={3}
              />
              {isMentor && <CheckGroup legend="Tipos de ajuda que voce oferece *" name="help" options={HELP_TYPES} selected={p.help} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label={isMentor ? "Nivel de experiencia" : "Nivel atual"} name="level" options={isMentor ? MENTOR_LEVELS : MENTEE_LEVELS} value={p.level} />
                {isMentor && (
                  <Field label="Mentorados ao mesmo tempo (opcional)">
                    <input name="maxMentees" type="number" min={1} max={50} defaultValue={p.maxMentees} className={inputCls} />
                  </Field>
                )}
              </div>
              {!isMentor && (
                <Field label="Objetivos de aprendizado" hint="Ex.: conseguir a primeira vaga em dados, montar um portfolio, aprender React.">
                  <textarea name="goals" rows={3} defaultValue={p.goals} className={inputCls} />
                </Field>
              )}
            </Card>

            <Card className="space-y-5">
              <h2 className="font-semibold">Disponibilidade</h2>
              <CheckGroup legend="Dias disponiveis *" name="days" options={WEEKDAYS} selected={p.days} columns={4} />
              <CheckGroup legend="Periodos *" name="periods" options={PERIODS} selected={p.periods} columns={4} />
              <div className="grid gap-4 sm:grid-cols-3">
                {isMentor && <SelectField label="Duracao de cada mentoria" name="sessionDuration" options={SESSION_DURATIONS} value={p.sessionDuration} />}
                <SelectField label="Horas por semana" name="weeklyHours" options={WEEKLY_HOURS} value={p.weeklyHours} />
                <SelectField label="Modalidade" name="modality" options={MODALITIES} value={p.modality} />
              </div>
            </Card>
          </>
        )}
        <p className="text-xs text-muted">Campos com * sao obrigatorios.</p>
        <button className={`${btnCls} w-full sm:w-auto`}>Salvar perfil</button>
      </form>
      <Card className="mt-10">
        <h2 id="arquivos" className="scroll-mt-24 font-semibold">Curriculo e arquivos</h2>
        <p className="mt-1 text-xs text-muted">O curriculo aparece so para quem tem uma mentoria, um vinculo ou um projeto ativo com voce, e para quem organiza um evento em que voce esta inscrita ou inscrito. Os arquivos de portfolio aparecem para quem pode ver o seu perfil.</p>
        <h3 className="mt-4 text-sm font-semibold">Curriculo (PDF)</h3>
        <AttachmentList items={resume} removableIds={resume.map((a) => a.id)} ret="/perfil" empty="Nenhum curriculo enviado." />
        {resume.length === 0 && <UploadForm scope="resume" label="Enviar curriculo" pdfOnly withTitle={false} />}
        <h3 className="mt-6 text-sm font-semibold">Portfolio e evidencias (ate 5)</h3>
        <AttachmentList items={files} removableIds={files.map((a) => a.id)} ret="/perfil" />
        {files.length < 5 && <UploadForm scope="profile" />}
      </Card>
      <details id="excluir-conta" className="mt-10 rounded-lg border border-red-400/30 bg-red-400/5 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-red-300">Excluir minha conta</summary>
        <form action={deleteAccount} data-no-keep className="mt-4 space-y-4">
          <p className="text-sm text-muted">
            Isso apaga de forma definitiva sua conta e os dados ligados a ela: perfil, mentorias, projetos, eventos,
            inscricoes, convites, certificados e notificacoes. Nao da para desfazer.
          </p>
          <Field label="Digite sua senha para confirmar">
            <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="confirm" value="1" required /> Entendo que a exclusao e definitiva.
          </label>
          <button className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
            Excluir minha conta definitivamente
          </button>
        </form>
      </details>
    </div>
  );
}
