import Link from "next/link";
import type { ReactNode } from "react";
import { currentVersion, versionLabel } from "@/lib/legal-versions";

const sectionsV1: { title: string; body: ReactNode }[] = [
  { title: "1. O que e a Ponte", body: <>A Ponte e uma plataforma educacional que conecta quem quer aprender com quem pode ensinar, por meio de mentorias, projetos, eventos e colaboracao. Ao criar uma conta, voce concorda com estes Termos, com o <Link href="/conduta" target="_blank" className="text-accent underline">Codigo de Conduta</Link> e com a <Link href="/privacidade" target="_blank" className="text-accent underline">Politica de Privacidade</Link>.</> },
  { title: "2. Sua conta", body: "Voce deve informar dados verdadeiros e manter seu e-mail atualizado. A conta e pessoal: nao compartilhe sua senha. Voce e responsavel pelo que for feito com ela. Contas podem ser de mentor, mentorado ou empresa, e cada papel tem recursos proprios." },
  { title: "3. Sem vinculo de trabalho", body: "A participacao em mentorias, projetos ou eventos nao cria contrato de trabalho, estagio, promessa de vaga ou qualquer vinculo empregaticio entre participantes, mentores, empresas ou a plataforma." },
  { title: "4. Mentorias", body: "Mentores participam de forma voluntaria e compartilham experiencia, sem garantia de resultado. Combinados de horario e formato sao feitos entre as pessoas envolvidas. Qualquer um pode encerrar a mentoria." },
  { title: "5. Projetos", body: "Quem cria um projeto define a visibilidade, as vagas e quem participa. Antes de publicar ou contribuir, respeite direitos autorais e licencas, e nao envie dados confidenciais de terceiros." },
  { title: "6. Eventos", body: "Organizadores sao responsaveis pelas informacoes, vagas, check-in e certificados dos seus eventos. Em eventos presenciais, siga as orientacoes do organizador. A confirmacao \"Cheguei bem em casa\" e voluntaria e nao usa localizacao." },
  { title: "7. Conteudo que voce publica", body: "Voce continua dono do que publica e autoriza a Ponte a exibir esse conteudo conforme a visibilidade escolhida. Conteudos que violem estes Termos ou o Codigo de Conduta podem ser removidos." },
  { title: "8. Certificados", body: "Os certificados comprovam a presenca registrada pelo organizador. Eles podem ser validados publicamente pelo codigo." },
  { title: "9. Condutas proibidas", body: "Assedio, discriminacao, fraude, perfis falsos, coleta de dados de outras pessoas, envio de spam ou uso da plataforma para atividades ilegais. As consequencias estao no Codigo de Conduta e vao de orientacao ate o encerramento da conta." },
  { title: "10. Privacidade", body: "O tratamento dos seus dados segue a Politica de Privacidade e a LGPD. Seu e-mail nao e exibido para outras pessoas sem autorizacao." },
  { title: "11. Encerramento", body: "Voce pode excluir sua conta quando quiser, pelo perfil. A Ponte pode suspender contas que violem estes Termos. Alguns registros, como certificados emitidos, podem ser mantidos pelo tempo necessario." },
  { title: "12. Limites de responsabilidade", body: "A Ponte oferece o espaco de conexao. Ela nao garante resultados de mentorias, contratacoes ou a conduta de cada participante fora da plataforma." },
  { title: "13. Mudancas", body: "Estes Termos podem mudar. Quando isso acontecer, avisaremos na plataforma e, se a mudanca for relevante, pediremos um novo aceite." },
  { title: "14. Contato", body: "Duvidas e pedidos sobre estes Termos: pelo canal da administracao da Ponte." },
];

const sectionsV2 = sectionsV1.map((s) =>
  s.title === "6. Eventos"
    ? { ...s, body: "Organizadores sao responsaveis pelas informacoes, vagas, check-in e certificados dos seus eventos. Em eventos presenciais, siga as orientacoes do organizador. A confirmacao \"Cheguei bem em casa\" e voluntaria e nao usa localizacao. Eventos pagos: o valor, a forma de pagamento, a cobranca, a nota ou recibo e a devolucao de valores, inclusive em caso de cancelamento ou desistencia, sao combinados e de responsabilidade do organizador. O pagamento e feito direto com ele, fora da Ponte, que nao recebe, nao intermedeia e nao devolve valores. A inscricao em evento pago so e confirmada quando o organizador aprova, depois de conferir o pagamento." }
    : s,
);

function Sections({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted">
      {items.map((s) => (
        <section key={s.title}>
          <h2 className="font-semibold text-fg">{s.title}</h2>
          <p>{s.body}</p>
        </section>
      ))}
    </div>
  );
}

/** Texto de cada versao publicada; as versoes antigas nunca mudam. */
export const TERMS_TEXTS: Record<number, () => ReactNode> = {
  1: () => <Sections items={sectionsV1} />,
  2: () => <Sections items={sectionsV2} />,
};

/** Versao em vigor dos Termos, usada na caixa de aceite do cadastro. */
export function TermsText() {
  const v = currentVersion("terms");
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{versionLabel(v)}</p>
      {TERMS_TEXTS[v.version]()}
    </div>
  );
}
