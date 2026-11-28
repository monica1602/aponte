import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Quem somos — Ponte" };

const PEOPLE = [
  {
    name: "Luan Lima",
    photo: "/quem-somos/luan.webp",
    bio: "Mestre pela Universidade Federal de Pernambuco (UFPE), Luan Lima possui uma trajetória profissional e acadêmica que conecta ciência de dados, inteligência artificial, tecnologia e pesquisa operacional. Atua no mercado financeiro, no PagBank, e reúne conhecimentos em análise de dados, machine learning, engenharia de dados e modelagem matemática aplicada à resolução de problemas complexos e à tomada de decisões. Sua trajetória também é marcada pelo envolvimento com pesquisa científica, produção de conteúdo educacional, projetos de impacto social e desenvolvimento de talentos. Possui experiência como mentor voluntário na Generation Brasil e participação em iniciativas que promovem o acesso ao conhecimento e à tecnologia.",
  },
  {
    name: "Mônica Hideco",
    photo: "/quem-somos/monica.webp",
    bio: "Engenheira de Produção, pós-graduada em Gestão de Projetos e especialista em Análise de Dados, com formação complementar em Business Communication. Possui experiência em gestão administrativa e financeira, inteligência de negócios, tecnologia e desenvolvimento de projetos orientados por dados. Sua trajetória de transição para a área de tecnologia reforçou sua compreensão dos desafios enfrentados por profissionais que buscam novas oportunidades no mercado de trabalho, independentemente da idade ou do momento da carreira.",
  },
  {
    name: "Wellington Lacerda",
    photo: "/quem-somos/wellington.webp",
    bio: "Profissional da área de dados, com conhecimentos em análise estatística, modelagem preditiva, engenharia de dados, Business Intelligence e Machine Learning. Possui experiência no desenvolvimento de projetos que transformam dados em informações estratégicas, utilizando a tecnologia para solucionar problemas reais e apoiar a tomada de decisões. Acredita no potencial da tecnologia, da colaboração e do compartilhamento de conhecimento como ferramentas de transformação profissional e social, contribuindo para a construção de um mercado de trabalho mais inclusivo, acessível e conectado, independentemente da idade ou do momento da carreira.",
  },
];

export default function QuemSomosPage() {
  return (
    <div className="py-12">
      <Eyebrow>Quem somos</Eyebrow>
      <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Quem somos</h1>
      <ul aria-label="Quem somos" className="mt-12 space-y-16">
        {PEOPLE.map((p, i) => (
          <li key={p.name} className={`flex flex-col items-center gap-8 sm:items-center ${i % 2 ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo} alt={`Foto de ${p.name}`} width={192} height={192} className="h-48 w-48 shrink-0 rounded-2xl object-cover shadow-xl shadow-black/40" />
            <div className="w-full">
              <h2 className="text-2xl font-bold tracking-tight">{p.name}</h2>
              <p className="mt-3 leading-relaxed text-muted">{p.bio}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
