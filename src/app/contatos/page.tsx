import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { InstagramIcon, LinkedinIcon, MailIcon } from "@/components/contact-icons";
import { CONTACT } from "@/lib/contact";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Contatos — Ponte" };

const CHANNELS = [
  { label: "E-mail", value: CONTACT.email, href: `mailto:${CONTACT.email}`, Icon: MailIcon },
  { label: "Instagram", value: CONTACT.instagramHandle, href: CONTACT.instagram, Icon: InstagramIcon },
  { label: "LinkedIn", value: CONTACT.linkedinName, href: CONTACT.linkedin, Icon: LinkedinIcon },
];

export default async function ContatosPage() {
  const user = await getSessionUser();
  return (
    <div className="grid gap-12 py-12 lg:grid-cols-[1fr_1px_1.5fr] lg:gap-14">
      <section aria-labelledby="contatos-titulo">
        <Eyebrow>Contatos</Eyebrow>
        <h1 id="contatos-titulo" className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-4xl xl:text-5xl">Fale com a gente</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Tem uma dúvida, sugestão, elogio ou reclamação? Escreva para a Ponte. Respondemos pelo e-mail que você informar.
        </p>
        <ul aria-label="Nossos contatos" className="mt-10 space-y-6">
          {CHANNELS.map(({ label, value, href, Icon }) => (
            <li key={label}>
              <a
                href={href}
                {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="group flex items-center gap-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raised text-accent transition-colors group-hover:bg-accent group-hover:text-ink">
                  <Icon />
                </span>
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-muted group-hover:text-fg">{value}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <div aria-hidden="true" className="h-px bg-line lg:h-auto lg:w-px" />
      <section aria-labelledby="mensagem-titulo" className="lg:pt-10">
        <h2 id="mensagem-titulo" className="text-2xl font-bold tracking-tight">Envie uma mensagem</h2>
        <ContactForm name={user?.name ?? ""} email={user?.email ?? ""} />
      </section>
    </div>
  );
}
