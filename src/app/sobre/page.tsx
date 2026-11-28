import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { Eyebrow, btnCls, btnSecondaryCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sobre — Ponte" };

const ABOUT = [
  "A Ponte nasceu para transformar trajetórias profissionais por meio da conexão entre pessoas, conhecimento e oportunidades. Somos uma plataforma de desenvolvimento profissional que aproxima profissionais experientes, pessoas em início de carreira, profissionais em transição e empresas que buscam desenvolver e descobrir novos talentos.",
  "Acreditamos que o conhecimento ganha valor quando é compartilhado e que a experiência profissional pode transformar vidas, independentemente da idade, formação, localização ou momento da carreira.",
  "Por meio de mentorias, projetos colaborativos, eventos, networking, capacitação e oportunidades profissionais, construímos um ambiente em que o aprendizado se transforma em experiência prática, competências se tornam visíveis e conexões geram novas possibilidades.",
  "Para as empresas, oferecemos um caminho para identificar, desenvolver e conectar-se com talentos a partir de suas habilidades, contribuições e experiências reais, aproximando as necessidades do mercado do desenvolvimento profissional.",
  "Mais do que conectar pessoas, a A Ponte busca transformar conhecimento em oportunidades, experiência em desenvolvimento e potencial em resultados, gerando valor humano, social e econômico para todo o ecossistema.",
];

const MISSION =
  "Conectar pessoas, gerações, conhecimentos e empresas, democratizando o acesso ao desenvolvimento profissional por meio de mentorias, experiências práticas, educação e oportunidades de carreira, promovendo a inclusão, a empregabilidade e o crescimento sustentável de profissionais e organizações.";

const VISION =
  "Ser referência nacional e internacional em desenvolvimento profissional, mentoria intergeracional e conexão entre talentos e empresas, transformando a maneira como as pessoas aprendem, evoluem e constroem suas carreiras, contribuindo para um mercado de trabalho mais inclusivo, colaborativo e preparado para o futuro.";

const VALUES = [
  { title: "Conexão entre gerações", body: "Acreditamos que diferentes gerações possuem conhecimentos, experiências e perspectivas complementares, capazes de gerar desenvolvimento mútuo e transformar o mercado de trabalho." },
  { title: "Inclusão, diversidade e equidade", body: "Valorizamos as diferenças e acreditamos que todas as pessoas devem ter acesso a oportunidades de desenvolvimento, independentemente de idade, gênero, origem, formação, condição socioeconômica ou trajetória profissional." },
  { title: "Aprendizado contínuo", body: "Entendemos que o desenvolvimento profissional acontece ao longo de toda a vida. Incentivamos a curiosidade, a atualização de conhecimentos e a capacidade de adaptação." },
  { title: "Colaboração e compartilhamento de conhecimento", body: "Acreditamos que o crescimento coletivo é potencializado pela troca de experiências, pela cooperação e pela construção conjunta de soluções." },
  { title: "Protagonismo e autonomia", body: "Incentivamos cada profissional a assumir um papel ativo na construção da própria carreira, desenvolvendo habilidades, tomando decisões e explorando novas possibilidades." },
  { title: "Ética, respeito e transparência", body: "Construímos relações baseadas na confiança, na integridade, na responsabilidade, na segurança e no respeito a todas as pessoas e organizações." },
  { title: "Inovação com propósito", body: "Utilizamos a tecnologia como instrumento para aproximar pessoas, reduzir barreiras, ampliar oportunidades e solucionar desafios reais do mercado de trabalho." },
  { title: "Valorização das competências e do potencial humano", body: "Reconhecemos que o talento vai além de diplomas, currículos, idade ou tempo de experiência. Valorizamos habilidades, contribuições práticas, dedicação e capacidade de evolução." },
  { title: "Impacto social e econômico", body: "Buscamos gerar resultados concretos para profissionais, empresas e sociedade, ampliando a empregabilidade, fortalecendo carreiras e contribuindo para o desenvolvimento econômico." },
  { title: "Sustentabilidade e geração de valor", body: "Acreditamos em um modelo de negócio sustentável, capaz de conciliar propósito social, crescimento empresarial, viabilidade financeira e geração de valor para todos os participantes do ecossistema." },
];

const PURPOSE =
  "Construir pontes que transformam conhecimento em oportunidades, conectando pessoas de diferentes gerações para que nenhuma trajetória profissional seja limitada pela falta de experiência, orientação ou acesso ao mercado.";

export default async function SobrePage() {
  const user = await getSessionUser();
  return (
    <div className="py-12">
      <Eyebrow>Sobre</Eyebrow>
      <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Sobre a A Ponte</h1>
      <div className="mt-6 max-w-3xl space-y-4 text-lg leading-relaxed text-muted">
        {ABOUT.map((p) => <p key={p}>{p}</p>)}
      </div>

      <section className="mt-16 grid gap-6 border-t border-line pt-12 md:grid-cols-2">
        <div aria-labelledby="missao" className="rounded-lg border border-line bg-surface p-6">
          <h2 id="missao" className="text-2xl font-bold tracking-tight">Missão</h2>
          <p className="mt-3 leading-relaxed text-muted">{MISSION}</p>
        </div>
        <div aria-labelledby="visao" className="rounded-lg border border-line bg-surface p-6">
          <h2 id="visao" className="text-2xl font-bold tracking-tight">Visão</h2>
          <p className="mt-3 leading-relaxed text-muted">{VISION}</p>
        </div>
      </section>

      <section aria-labelledby="valores" className="mt-16 border-t border-line pt-12">
        <h2 id="valores" className="text-2xl font-bold tracking-tight">Valores</h2>
        <ol aria-label="Valores" className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map((v, i) => (
            <li key={v.title} className="border-t border-line pt-5">
              <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 font-semibold">{i + 1}. {v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="proposito" className="mt-16 rounded-lg border border-accent/40 bg-surface p-8">
        <h2 id="proposito" className="text-2xl font-bold tracking-tight">Propósito</h2>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed">{PURPOSE}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {user ? (
            <Link href="/dashboard" className={`${btnCls} px-6 py-3`}>Ir para o Painel</Link>
          ) : (
            <>
              <Link href="/signup" className={`${btnCls} px-6 py-3`}>Criar minha conta</Link>
              <Link href="/login" className={`${btnSecondaryCls} px-6 py-3`}>Ja tenho conta</Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
