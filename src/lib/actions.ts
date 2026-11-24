"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import { audit, getDb, hashPassword, notify, verifyPassword, type User } from "./db";
import {
  clearAdminPending,
  createAdminPending,
  createAdminSession,
  createSession,
  destroyAdminSession,
  destroySession,
  getSessionUser,
  hasAdminPending,
  isAdmin,
} from "./auth";
import { activeTwoFactor, checkSecondFactor, disableTwoFactor, enableTwoFactor, twoFactorResetOn } from "./admin-2fa";
import { alertAdmin, ROLE_PT } from "./admin-alert";
import { passwordProblem } from "./password-policy";
import { emailUser } from "./user-email";
import { bareUrl } from "./url";
import { checkInWindow, eventStarted, spTime } from "./event-time";
import { blockedFor, clearAttempts, recordAttempt, tooManyMessage } from "./rate-limit";
import { clientIp, requireVerified, safeReturn, siteUrl } from "./session";
import { pendingLegalDocs, recordLegalAcceptance } from "./legal-acceptance";
import { recordConsent, recordConsentChanges } from "./consents";
import { canIssueCertificate, safeHomeOpen } from "./retention";
import { promoteWaitlist } from "./waitlist";
import {
  REQUEST_KIND_PT, REQUEST_KINDS, createEmailChange, emailChangeTarget, markEmailChangeUsed, sendPlainEmail, type RequestKind,
} from "./my-data";
import { createVerificationToken, sendVerificationEmail, markVerificationUsed, verificationTarget } from "./email-verification";

const LINK_RE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

async function nameOf(id: number): Promise<string> {
  const r = (await getDb().prepare("SELECT name FROM users WHERE id = ?").get(id)) as { name: string } | undefined;
  return r?.name ?? "alguem";
}

function back(path: string, key: "msg" | "error", text: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(text)}`);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// Set REQUIRE_APPROVAL=1 to keep new accounts pending until approved in /admin.
const REQUIRE_APPROVAL = process.env.REQUIRE_APPROVAL === "1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_MODALITIES = ["online", "in_person", "hybrid"];

async function me(allowPendingTerms = false): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user!.account_status !== "active") redirect("/login?error=Sua conta ainda nao esta ativa.");
  if (user!.must_change_password) redirect("/primeiro-acesso");
  if (!allowPendingTerms && (await pendingLegalDocs(user!.id)).length) redirect("/novos-termos");
  return user!;
}

async function sendEmailVerification(userId: number, email: string, name: string, role: string): Promise<void> {
  const token = await createVerificationToken(userId);
  const base = await siteUrl();
  const date = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  after(() => sendVerificationEmail(email, name, ROLE_PT[role] ?? role, date, base, token));
}

function isEventOwner(user: User): boolean {
  return user.role === "mentor" || user.role === "company";
}

function validDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function adminLogin(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const ip = await clientIp();
  const adminLimit = [{ action: "admin_login", subject: `ip:${ip}`, max: 5, windowMin: 15 }];
  const wait = await blockedFor(adminLimit);
  if (wait) back("/admin/login", "error", tooManyMessage(wait));
  const expected = process.env.ADMIN_PASSWORD;
  const ok =
    !!expected &&
    email === (process.env.ADMIN_EMAIL ?? "").toLowerCase() &&
    password === expected;
  if (!ok) {
    await recordAttempt("admin_login", [`ip:${ip}`]);
    if (await blockedFor(adminLimit)) await alertAdmin("Login da administracao bloqueado por 15 minutos depois de 5 tentativas erradas");
    back("/admin/login", "error", "Credenciais invalidas.");
  }
  if (twoFactorResetOn()) {
    if (await activeTwoFactor()) {
      await disableTwoFactor();
      await audit(null, "admin.2fa_reset", "admin", null);
      await alertAdmin("Dois fatores da administracao desligados pela configuracao ADMIN_2FA_RESET");
    }
  } else if (await activeTwoFactor()) {
    await createAdminPending();
    redirect("/admin/login/codigo");
  }
  await createAdminSession();
  redirect("/admin");
}

export async function adminVerifyCode(formData: FormData) {
  if (!(await hasAdminPending())) back("/admin/login", "error", "Tempo esgotado. Entre de novo com e-mail e senha.");
  const ip = await clientIp();
  const limit = [{ action: "admin_2fa", subject: `ip:${ip}`, max: 5, windowMin: 15 }];
  const wait = await blockedFor(limit);
  if (wait) back("/admin/login/codigo", "error", tooManyMessage(wait));
  const kind = await checkSecondFactor(str(formData, "code"));
  if (!kind) {
    await recordAttempt("admin_2fa", [`ip:${ip}`]);
    if (await blockedFor(limit)) await alertAdmin("Codigo de dois fatores da administracao bloqueado por 15 minutos depois de 5 codigos errados");
    back("/admin/login/codigo", "error", "Codigo invalido ou ja usado.");
  }
  await clearAdminPending();
  if (kind === "recovery") await audit(null, "admin.2fa_recovery_used", "admin", null);
  await createAdminSession();
  redirect("/admin");
}

const RECOVERY_COOKIE = "ponte_admin_recovery";

export async function enableAdminTwoFactor(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  if (twoFactorResetOn()) back("/admin/seguranca", "error", "Remova ADMIN_2FA_RESET da Vercel antes de ativar.");
  const codes = await enableTwoFactor(str(formData, "code").replace(/\s/g, ""));
  if (!codes) back("/admin/seguranca", "error", "Codigo invalido. Confira o codigo atual no aplicativo e tente de novo.");
  await audit(null, "admin.2fa_enabled", "admin", null);
  (await cookies()).set(RECOVERY_COOKIE, codes.join(","), {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 10,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/admin/seguranca");
}

export async function dismissRecoveryCodes() {
  if (!(await isAdmin())) redirect("/admin/login");
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: "/admin" });
  redirect("/admin/seguranca");
}

export async function disableAdminTwoFactor(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  if (!(await checkSecondFactor(str(formData, "code")))) {
    back("/admin/seguranca", "error", "Codigo invalido ou ja usado. Os dois fatores continuam ligados.");
  }
  await disableTwoFactor();
  await audit(null, "admin.2fa_disabled", "admin", null);
  back("/admin/seguranca", "msg", "Dois fatores desligados. O login da administracao volta a pedir so e-mail e senha.");
}

export async function adminLogout() {
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function addInvite(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const email = str(formData, "email").toLowerCase();
  const role = str(formData, "role");
  if (!EMAIL_RE.test(email) || !["mentor", "mentee", "company"].includes(role)) {
    back("/admin/cadastros", "error", "Informe um email valido e o papel.");
  }
  if (await getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    back("/admin/cadastros", "error", "Este email ja possui conta.");
  }
  try {
    await getDb().prepare("INSERT INTO invites (email, role) VALUES (?,?)").run(email, role);
  } catch {
    back("/admin/cadastros", "error", "Este email ja foi convidado.");
  }
  back("/admin/cadastros", "msg", `Convite criado para ${email}.`);
}

export async function removeInvite(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  await getDb()
    .prepare("DELETE FROM invites WHERE email = ?")
    .run(str(formData, "email").toLowerCase());
  back("/admin/cadastros", "msg", "Convite removido.");
}

export async function login(formData: FormData) {
  const next = safeReturn(str(formData, "next"), "");
  const loginPage = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const ip = await clientIp();
  const emailLimit = { action: "login", subject: `email:${email}`, max: 5, windowMin: 15 };
  const wait = await blockedFor([emailLimit, { action: "login", subject: `ip:${ip}`, max: 30, windowMin: 15 }]);
  if (wait) back(loginPage, "error", tooManyMessage(wait));
  const user = await getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | User
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    await recordAttempt("login", [emailLimit.subject, `ip:${ip}`]);
    if (user && (await blockedFor([emailLimit]))) {
      await emailUser(
        user.id,
        "Varias tentativas de entrar na sua conta",
        "Houve varias tentativas de entrar na sua conta com a senha errada. Por seguranca, o login ficou bloqueado por 15 minutos. Se nao foi voce, recomendamos trocar sua senha.",
        "Trocar minha senha",
        "/esqueci-senha",
        "essential"
      );
    }
    back(loginPage, "error", "Email ou senha incorretos.");
  }
  await clearAttempts("login", emailLimit.subject);
  if (user!.account_status === "pending" && !REQUIRE_APPROVAL) {
    // Accounts created while approval was required are released automatically.
    await getDb().prepare("UPDATE users SET account_status = 'active' WHERE id = ?").run(user!.id);
    user!.account_status = "active";
  }
  if (user!.account_status === "pending") {
    back(loginPage, "error", "Seu cadastro esta aguardando aprovacao do administrador.");
  }
  if (user!.account_status === "rejected") {
    back(loginPage, "error", "Seu cadastro nao foi aprovado. Fale com o administrador.");
  }
  if (user!.account_status === "disputed") {
    back(loginPage, "error", "Esta conta foi desativada porque o dono do e-mail informou que nao criou o cadastro. Fale com o administrador.");
  }
  if (!user!.must_change_password && passwordProblem(password)) {
    await getDb().prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(user!.id);
    user!.must_change_password = 1;
  }
  await createSession(user!.id);
  if (user!.must_change_password) redirect("/primeiro-acesso");
  if ((await pendingLegalDocs(user!.id)).length) redirect("/novos-termos");
  redirect(next || "/dashboard");
}

export async function registerAccount(formData: FormData) {
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const confirmation = str(formData, "confirmation");
  const role = str(formData, "role");
  const ret = ["mentor", "mentee", "company"].includes(role) ? `/signup?role=${role}` : "/signup";
  const ip = await clientIp();
  const wait = await blockedFor([{ action: "signup", subject: `ip:${ip}`, max: 20, windowMin: 60 }]);
  if (wait) back(ret, "error", tooManyMessage(wait));
  if (name.length < 2) back(ret, "error", "Informe seu nome (ou o nome da empresa) com pelo menos 2 caracteres.");
  if (!EMAIL_RE.test(email)) back(ret, "error", "Informe um email valido, por exemplo nome@dominio.com.");
  const weak = passwordProblem(password);
  if (weak) back(ret, "error", weak);
  if (password !== confirmation) back(ret, "error", "A confirmacao de senha nao confere.");
  if (!["mentor", "mentee", "company"].includes(role)) {
    back(ret, "error", "Escolha se deseja se cadastrar como mentor, mentorado ou empresa.");
  }
  if (formData.get("employment_terms") !== "on" || formData.get("code_of_conduct") !== "on") {
    back(ret, "error", "Aceite as condicoes de participacao e o Codigo de Conduta para enviar seu cadastro.");
  }
  if (formData.get("public_profile_consent") !== "on") {
    back(ret, "error", "Para participar da rede, confirme que entende quais dados do perfil ficarao publicos.");
  }
  const db = getDb();
  if (await db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    back(ret, "error", "Este email ja possui cadastro.");
  }
  const result = await db.prepare(
    `INSERT INTO users (
      email, password_hash, name, role, account_status, image_consent,
      public_profile_consent, public_profile_consent_at,
      employment_terms_accepted_at, code_of_conduct_accepted_at, email_status
    ) VALUES (?,?,?,?, ?, ?, 1, datetime('now'), datetime('now'), datetime('now'), 'pending')`
  ).run(email, hashPassword(password), name, role, REQUIRE_APPROVAL ? "pending" : "active", formData.get("image_consent") === "on" ? 1 : 0);
  const newUserId = Number(result.lastInsertRowid);
  await recordLegalAcceptance(newUserId, "cadastro");
  await recordConsent(newUserId, "public_profile", true, "cadastro");
  if (formData.get("image_consent") === "on") await recordConsent(newUserId, "image", true, "cadastro");
  await recordAttempt("signup", [`ip:${ip}`]);
  await sendEmailVerification(newUserId, email, name, role);
  await audit(null, REQUIRE_APPROVAL ? "account.requested" : "account.created", "user", newUserId);
  await alertAdmin(`Novo cadastro de ${ROLE_PT[role]}: ${name}${REQUIRE_APPROVAL ? " (aguardando aprovacao)" : ""}`);
  if (REQUIRE_APPROVAL) back("/login", "msg", "Cadastro enviado. Aguarde a aprovacao do administrador para entrar.");
  await createSession(newUserId);
  back("/perfil", "msg", "Conta criada! Enviamos um e-mail para confirmar que foi voce. Enquanto isso, complete seu perfil para receber recomendacoes por compatibilidade.");
}

export async function reviewAccount(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("id"));
  const decision = str(formData, "decision");
  if (!Number.isInteger(id) || !["approve", "reject"].includes(decision)) {
    back("/admin/cadastros", "error", "Cadastro invalido.");
  }
  const db = getDb();
  const user = await db.prepare("SELECT id FROM users WHERE id = ? AND account_status = 'pending'").get(id);
  if (!user) back("/admin/cadastros", "error", "Cadastro nao encontrado ou ja analisado.");
  const status = decision === "approve" ? "active" : "rejected";
  await db.prepare("UPDATE users SET account_status = ? WHERE id = ?").run(status, id);
  await audit(null, `account.${status}`, "user", id);
  back("/admin/cadastros", "msg", decision === "approve" ? "Cadastro aprovado e liberado para uso." : "Cadastro recusado.");
}

export async function createMentee(formData: FormData) {
  const mentor = await me();
  if (mentor.role !== "mentor") redirect("/dashboard");
  requireVerified(mentor, "/dashboard");
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const temporaryPassword = str(formData, "temporary_password");
  if (name.length < 2 || !EMAIL_RE.test(email)) back("/dashboard", "error", "Informe nome e email valido.");
  const weakTemp = passwordProblem(temporaryPassword);
  if (weakTemp) {
    back("/dashboard", "error", `Senha temporaria: ${weakTemp}`);
  }
  const db = getDb();
  if (await db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    back("/dashboard", "error", "Este email ja possui uma conta.");
  }
  const result = await db.prepare(
    "INSERT INTO users (email, password_hash, name, role, account_status, must_change_password, email_status) VALUES (?,?,?,?, 'pending', 1, 'pending')"
  ).run(email, hashPassword(temporaryPassword), name, "mentee");
  const menteeId = Number(result.lastInsertRowid);
  await sendEmailVerification(menteeId, email, name, "mentee");
  await db.prepare("INSERT INTO mentorships (mentor_id, mentee_id, status) VALUES (?,?,'active')").run(mentor.id, menteeId);
  await audit(mentor.id, "mentee.created_by_mentor", "user", menteeId);
  back("/dashboard", "msg", "Mentorado criado e conectado a sua rede. O administrador ainda precisa aprovar o cadastro antes do primeiro acesso.");
}

export async function changeInitialPassword(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const password = str(formData, "password");
  const confirmation = str(formData, "confirmation");
  const weak = passwordProblem(password);
  if (weak) back("/primeiro-acesso", "error", weak);
  if (password !== confirmation) {
    back("/primeiro-acesso", "error", "A confirmacao de senha nao confere.");
  }
  if (user!.code_of_conduct_accepted_at && user!.public_profile_consent) {
    await getDb().prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(password), user!.id);
    await audit(user!.id, "password.policy_updated", "user", user!.id);
    if ((await pendingLegalDocs(user!.id)).length) redirect("/novos-termos");
    back("/dashboard", "msg", "Senha atualizada. Obrigado por deixar sua conta mais segura.");
  }
  if (formData.get("employment_terms") !== "on" || formData.get("code_of_conduct") !== "on") {
    back("/primeiro-acesso", "error", "Aceite as condicoes de participacao e o codigo de conduta para continuar.");
  }
  if (formData.get("public_profile_consent") !== "on") {
    back("/primeiro-acesso", "error", "Confirme que entende quais dados do perfil ficarao publicos para continuar.");
  }
  await getDb().prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0,
      image_consent = ?, public_profile_consent = 1, public_profile_consent_at = datetime('now'), employment_terms_accepted_at = datetime('now'),
      code_of_conduct_accepted_at = datetime('now') WHERE id = ?`
  ).run(hashPassword(password), formData.get("image_consent") === "on" ? 1 : 0, user!.id);
  await recordLegalAcceptance(user!.id, "primeiro_acesso");
  await recordConsentChanges(user!.id, [
    ["public_profile", !!user!.public_profile_consent, true],
    ["image", !!user!.image_consent, formData.get("image_consent") === "on"],
  ], "primeiro_acesso");
  await audit(user!.id, "password.initial_changed", "user", user!.id);
  redirect("/dashboard");
}

export async function acceptLegalUpdates(formData: FormData) {
  const user = await me(true);
  const pending = await pendingLegalDocs(user.id);
  if (!pending.length) redirect("/dashboard");
  if (pending.some((doc) => formData.get(`accept_${doc}`) !== "on")) {
    back("/novos-termos", "error", "Leia ate o fim e aceite cada documento atualizado para continuar.");
  }
  await recordLegalAcceptance(user.id, "reaceite", pending);
  if (pending.includes("terms")) await getDb().prepare("UPDATE users SET employment_terms_accepted_at = datetime('now') WHERE id = ?").run(user.id);
  if (pending.includes("conduct")) await getDb().prepare("UPDATE users SET code_of_conduct_accepted_at = datetime('now') WHERE id = ?").run(user.id);
  await audit(user.id, "legal.reaccepted", "user", user.id);
  back("/dashboard", "msg", "Obrigado! Seu aceite dos documentos atualizados foi registrado.");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function deleteAccount(formData: FormData) {
  const user = await me(true);
  const ret = formData.get("ret") === "/novos-termos" ? "/novos-termos" : "/perfil";
  const password = String(formData.get("password") ?? "");
  if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para excluir a conta.");
  const deleteLimit = { action: "delete_account", subject: `user:${user.id}`, max: 5, windowMin: 15 };
  const wait = await blockedFor([deleteLimit]);
  if (wait) back(ret, "error", tooManyMessage(wait));
  const row = (await getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id)) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    await recordAttempt("delete_account", [deleteLimit.subject]);
    back(ret, "error", "Senha incorreta. A conta nao foi excluida.");
  }
  await destroySession();
  await getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  await getDb().prepare("DELETE FROM legal_acceptances WHERE user_id = ?").run(user.id);
  await getDb().prepare("DELETE FROM consent_events WHERE user_id = ?").run(user.id);
  await getDb().prepare("DELETE FROM data_requests WHERE user_id = ?").run(user.id);
  await getDb().prepare("DELETE FROM email_changes WHERE user_id = ?").run(user.id);
  await getDb().prepare("DELETE FROM users WHERE id = ?").run(user.id);
  await alertAdmin(`Conta excluida pelo proprio usuario: ${user.name} (${ROLE_PT[user.role] ?? user.role})`);
  redirect(`/login?msg=${encodeURIComponent("Sua conta e seus dados foram excluidos.")}`);
}

export async function updateProfile(formData: FormData) {
  const user = await me();
  const publicProfile = formData.get("public_profile_consent") === "on";
  const image = formData.get("image_consent") === "on";
  await getDb()
    .prepare(`UPDATE users SET headline = ?, bio = ?, skills = ?,
      public_profile_consent = ?, public_profile_consent_at = CASE WHEN ? = 1 THEN COALESCE(public_profile_consent_at, datetime('now')) ELSE NULL END,
      image_consent = ?
      WHERE id = ?`)
    .run(
      str(formData, "headline"), str(formData, "bio"), str(formData, "skills"),
      publicProfile ? 1 : 0,
      publicProfile ? 1 : 0,
      image ? 1 : 0,
      user.id
    );
  await recordConsentChanges(user.id, [
    ["public_profile", !!user.public_profile_consent, publicProfile],
    ["image", !!user.image_consent, image],
  ], "perfil");
  await alertAdmin(`Cadastro atualizado: ${user.name} (${ROLE_PT[user.role] ?? user.role})`);
  back("/dashboard", "msg", "Perfil atualizado.");
}

export async function requestMentorship(formData: FormData) {
  const user = await me();
  const mentorId = Number(formData.get("mentor_id"));
  const ret = str(formData, "return") || "/mentores";
  requireVerified(user, ret);
  if (user.role !== "mentee") {
    back(ret, "error", "Apenas mentorados podem solicitar mentoria.");
  }
  if (mentorId === user.id) back(ret, "error", "Voce nao pode ser seu proprio mentor.");
  const mentor = await getDb()
    .prepare("SELECT id FROM users WHERE id = ? AND role IN ('mentor','company') AND account_status = 'active'")
    .get(mentorId);
  if (!mentor) back(ret, "error", "Mentor nao encontrado.");
  try {
    await getDb()
      .prepare("INSERT INTO mentorships (mentor_id, mentee_id, objective, message) VALUES (?,?,?,?)")
      .run(mentorId, user.id, str(formData, "objective").slice(0, 300), str(formData, "message").slice(0, 1000));
  } catch {
    back(ret, "error", "Voce ja possui uma solicitacao com este mentor.");
  }
  await notify(mentorId, `${user.name} pediu sua mentoria.`, "/dashboard");
  await emailUser(mentorId, `${user.name} pediu sua mentoria`, `${user.name} quer fazer parte da sua rede e pediu sua mentoria. Entre na Ponte para aceitar ou recusar.`, "Ver pedido", "/dashboard", "network");
  await alertAdmin(`Novo pedido de mentoria: ${user.name} pediu mentoria a ${await nameOf(mentorId)}`);
  back(ret, "msg", "Solicitacao de mentoria enviada. Voce sera avisado(a) quando o mentor responder.");
}

export async function respondMentorship(formData: FormData) {
  const user = await me();
  if (user.role !== "mentor" && user.role !== "company") redirect("/dashboard");
  const id = Number(formData.get("id"));
  const decision = str(formData, "decision");
  const db = getDb();
  const req = await db
    .prepare("SELECT id, mentee_id FROM mentorships WHERE id = ? AND mentor_id = ? AND status = 'pending' AND requested_by <> 'mentor'")
    .get(id, user.id) as { id: number; mentee_id: number } | undefined;
  if (!req) back("/dashboard", "error", "Solicitacao nao encontrada.");
  await notify(
    req!.mentee_id,
    decision === "accept" ? `${user.name} aceitou sua solicitacao de mentoria.` : `${user.name} nao pode aceitar sua mentoria agora.`,
    decision === "accept" ? "/aprendizado" : "/mentores"
  );
  if (decision === "accept") {
    await db.prepare("UPDATE mentorships SET status = 'active' WHERE id = ?").run(id);
    await alertAdmin(`Nova mentoria ativa: ${user.name} aceitou ${await nameOf(req!.mentee_id)}`);
  } else {
    await db.prepare("DELETE FROM mentorships WHERE id = ?").run(id);
  }
  back("/dashboard", "msg", decision === "accept" ? "Mentoria aceita." : "Solicitacao recusada.");
}

export async function inviteMentee(formData: FormData) {
  const user = await me();
  const menteeId = Number(formData.get("mentee_id"));
  const ret = str(formData, "return") || "/talentos";
  requireVerified(user, ret);
  if (user.role !== "mentor") back(ret, "error", "Apenas mentores podem convidar mentorados.");
  const mentee = await getDb()
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'mentee' AND account_status = 'active'")
    .get(menteeId);
  if (!mentee) back(ret, "error", "Mentorado nao encontrado.");
  try {
    await getDb()
      .prepare("INSERT INTO mentorships (mentor_id, mentee_id, objective, message, requested_by) VALUES (?,?,?,?, 'mentor')")
      .run(user.id, menteeId, str(formData, "objective").slice(0, 300), str(formData, "message").slice(0, 1000));
  } catch {
    back(ret, "error", "Voce ja tem uma mentoria ou convite com esta pessoa.");
  }
  await alertAdmin(`Novo convite de mentoria: ${user.name} convidou ${await nameOf(menteeId)}`);
  await notify(menteeId, `${user.name} convidou voce para uma mentoria. Aceite ou recuse em Mentores.`, "/minha-rede?aba=mentores");
  await emailUser(menteeId, `${user.name} convidou voce para uma mentoria`, `${user.name} convidou voce para fazer parte da rede de mentoria na Ponte. Entre no site para aceitar ou recusar o convite.`, "Ver convite", "/minha-rede?aba=mentores", "network");
  back(ret, "msg", "Convite enviado. O mentorado sera avisado e podera aceitar ou recusar.");
}

export async function respondMentorInvite(formData: FormData) {
  const user = await me();
  const ret = "/minha-rede?aba=mentores";
  if (user.role !== "mentee") back(ret, "error", "Apenas mentorados respondem convites.");
  const id = Number(formData.get("id"));
  const accept = str(formData, "decision") === "accept";
  const db = getDb();
  const inv = (await db
    .prepare("SELECT id, mentor_id FROM mentorships WHERE id = ? AND mentee_id = ? AND status = 'pending' AND requested_by = 'mentor'")
    .get(id, user.id)) as { id: number; mentor_id: number } | undefined;
  if (!inv) back(ret, "error", "Convite nao encontrado.");
  if (accept) {
    await db.prepare("UPDATE mentorships SET status = 'active' WHERE id = ?").run(id);
    await alertAdmin(`Nova mentoria ativa: ${user.name} aceitou o convite de ${await nameOf(inv!.mentor_id)}`);
  }
  else await db.prepare("DELETE FROM mentorships WHERE id = ?").run(id);
  await notify(
    inv!.mentor_id,
    accept ? `${user.name} aceitou seu convite de mentoria.` : `${user.name} recusou seu convite de mentoria.`,
    "/minha-rede?aba=mentorados"
  );
  back(ret, "msg", accept ? "Convite aceito. A mentoria esta ativa." : "Convite recusado.");
}

export async function inviteToCompany(formData: FormData) {
  const user = await me();
  const memberId = Number(formData.get("member_id"));
  const ret = str(formData, "return") || `/pessoas/${memberId}`;
  requireVerified(user, ret);
  if (user.role !== "company") back(ret, "error", "Apenas empresas enviam este convite.");
  const member = (await getDb()
    .prepare("SELECT id, role FROM users WHERE id = ? AND role IN ('mentor','mentee') AND account_status = 'active'")
    .get(memberId)) as { id: number; role: string } | undefined;
  if (!member) back(ret, "error", "Pessoa nao encontrada.");
  try {
    await getDb()
      .prepare("INSERT INTO company_links (company_id, member_id, message) VALUES (?,?,?)")
      .run(user.id, memberId, str(formData, "message").slice(0, 1000));
  } catch {
    back(ret, "error", "Esta pessoa ja faz parte da sua rede ou ja tem um convite seu.");
  }
  await notify(memberId, `${user.name} convidou voce para fazer parte da rede da empresa. Aceite ou recuse em Empresas.`, "/empresas");
  await emailUser(memberId, `${user.name} convidou voce para a rede da empresa`, `A empresa ${user.name} enviou uma proposta para voce fazer parte da rede dela na Ponte. Entre no site para aceitar ou recusar.`, "Ver proposta", "/empresas", "network");
  await alertAdmin(`Novo convite de empresa: ${user.name} convidou ${await nameOf(memberId)} (${ROLE_PT[member!.role]})`);
  back(ret, "msg", "Convite enviado. A pessoa recebe um aviso e um e-mail e pode aceitar ou recusar.");
}

export async function respondCompanyInvite(formData: FormData) {
  const user = await me();
  const ret = "/empresas";
  const id = Number(formData.get("id"));
  const accept = str(formData, "decision") === "accept";
  const db = getDb();
  const inv = (await db
    .prepare("SELECT id, company_id FROM company_links WHERE id = ? AND member_id = ? AND status = 'pending'")
    .get(id, user.id)) as { id: number; company_id: number } | undefined;
  if (!inv) back(ret, "error", "Convite nao encontrado.");
  if (accept) {
    await db.prepare("UPDATE company_links SET status = 'active' WHERE id = ?").run(id);
    await alertAdmin(`Nova conexao com empresa: ${user.name} aceitou o convite de ${await nameOf(inv!.company_id)}`);
  } else {
    await db.prepare("DELETE FROM company_links WHERE id = ?").run(id);
  }
  await notify(
    inv!.company_id,
    accept ? `${user.name} aceitou fazer parte da rede da empresa.` : `${user.name} recusou o convite da empresa.`,
    `/minha-rede?aba=${user.role === "mentor" ? "mentores" : "mentorados"}`
  );
  back(ret, "msg", accept ? "Convite aceito. Voce agora faz parte da rede da empresa." : "Convite recusado.");
}

export async function removeMentorship(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("id"));
  await getDb()
    .prepare("DELETE FROM mentorships WHERE id = ? AND (mentor_id = ? OR mentee_id = ?)")
    .run(id, user.id, user.id);
  back("/dashboard", "msg", "Conexao removida.");
}

export async function addContribution(formData: FormData) {
  const user = await me();
  if (user.role !== "mentee") redirect("/dashboard");
  const title = str(formData, "title");
  if (!title) back("/dashboard", "error", "Titulo da contribuicao e obrigatorio.");
  await getDb()
    .prepare(
      "INSERT INTO contributions (user_id, title, url, type, description) VALUES (?,?,?,?,?)"
    )
    .run(
      user.id,
      title,
      str(formData, "url"),
      str(formData, "type") || "projeto",
      str(formData, "description")
    );
  back("/dashboard", "msg", "Contribuicao publicada no seu perfil.");
}

export async function deleteContribution(formData: FormData) {
  const user = await me();
  await getDb()
    .prepare("DELETE FROM contributions WHERE id = ? AND user_id = ?")
    .run(Number(formData.get("id")), user.id);
  back("/dashboard", "msg", "Contribuicao removida.");
}

export async function toggleEndorsement(formData: FormData) {
  const user = await me();
  const contributionId = Number(formData.get("contribution_id"));
  const ret = str(formData, "return") || "/dashboard";
  requireVerified(user, ret);
  const db = getDb();
  const contribution = await db
    .prepare("SELECT user_id FROM contributions WHERE id = ?")
    .get(contributionId) as { user_id: number } | undefined;
  if (!contribution) back(ret, "error", "Contribuicao nao encontrada.");
  const link = await db
    .prepare(
      "SELECT id FROM mentorships WHERE mentor_id = ? AND mentee_id = ? AND status = 'active'"
    )
    .get(user.id, contribution!.user_id);
  if (!link) back(ret, "error", "Voce so pode recomendar contribuicoes da sua rede.");
  const existing = await db
    .prepare("SELECT 1 FROM endorsements WHERE contribution_id = ? AND mentor_id = ?")
    .get(contributionId, user.id);
  if (existing) {
    await db.prepare("DELETE FROM endorsements WHERE contribution_id = ? AND mentor_id = ?").run(
      contributionId,
      user.id
    );
  } else {
    await db.prepare("INSERT INTO endorsements (contribution_id, mentor_id) VALUES (?,?)").run(
      contributionId,
      user.id
    );
  }
  redirect(ret);
}

export async function addOpportunity(formData: FormData) {
  const user = await me();
  if (user.role !== "mentor" && user.role !== "company") redirect("/dashboard");
  requireVerified(user, "/dashboard");
  const title = str(formData, "title");
  const type = str(formData, "type");
  if (!title || !["open_source", "evento", "vaga"].includes(type)) {
    back("/dashboard", "error", "Preencha titulo e tipo da oportunidade.");
  }
  await getDb()
    .prepare(
      "INSERT INTO opportunities (owner_id, type, title, description, skills) VALUES (?,?,?,?,?)"
    )
    .run(user.id, type, title, str(formData, "description"), str(formData, "skills"));
  back("/dashboard", "msg", "Oportunidade publicada.");
}

export async function deleteOpportunity(formData: FormData) {
  const user = await me();
  await getDb()
    .prepare("DELETE FROM opportunities WHERE id = ? AND owner_id = ?")
    .run(Number(formData.get("id")), user.id);
  back("/dashboard", "msg", "Oportunidade removida.");
}

export async function createEvent(formData: FormData) {
  const user = await me();
  if (!isEventOwner(user)) back("/dashboard", "error", "Apenas mentores e empresas podem criar eventos.");
  requireVerified(user, "/dashboard");

  const title = str(formData, "title");
  const modality = str(formData, "modality");
  const startsAt = str(formData, "starts_at");
  const endsAt = str(formData, "ends_at");
  const onlineUrl = bareUrl(str(formData, "online_url"));
  const location = str(formData, "location");
  const capacityText = str(formData, "capacity");
  const capacity = capacityText ? Number(capacityText) : null;

  if (!title || !EVENT_MODALITIES.includes(modality) || !validDateTime(startsAt) || !validDateTime(endsAt)) {
    back("/dashboard", "error", "Preencha titulo, modalidade e datas validas.");
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    back("/dashboard", "error", "O termino deve acontecer depois do inicio.");
  }
  if ((modality === "online" || modality === "hybrid") && !onlineUrl) {
    back("/dashboard", "error", "Informe o link para o evento online.");
  }
  if (onlineUrl && !LINK_RE.test(onlineUrl)) {
    back("/dashboard", "error", "Link do encontro: informe um endereco valido, por exemplo meet.google.com/abc-defg-hij");
  }
  if ((modality === "in_person" || modality === "hybrid") && !location) {
    back("/dashboard", "error", "Informe o local do evento presencial.");
  }
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) {
    back("/dashboard", "error", "A capacidade deve ser um numero inteiro maior que zero.");
  }

  const result = await getDb()
    .prepare(
      `INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location, capacity, require_approval, category, city, state, organizer)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      user.id, title, str(formData, "description"), modality, startsAt, endsAt,
      onlineUrl, location, capacity, formData.get("require_approval") === "on" ? 1 : 0,
      str(formData, "category"), str(formData, "city"), str(formData, "state").toUpperCase().slice(0, 2),
      str(formData, "organizer") || user.name
    );
  const eventId = Number(result.lastInsertRowid);
  await audit(user.id, "event.created", "event", eventId);
  back("/dashboard", "msg", "Evento publicado e pronto para receber inscricoes.");
}

export async function deleteEvent(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("event_id"));
  const ret = str(formData, "return").startsWith("/") ? str(formData, "return") : "/meus-eventos";
  const db = getDb();
  const event = (await db.prepare("SELECT id, title FROM events WHERE id = ? AND owner_id = ?").get(id, user.id)) as { id: number; title: string } | undefined;
  if (!event) back("/meus-eventos", "error", "Evento nao encontrado ou voce nao e quem o cadastrou.");
  if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para excluir o evento.");
  const people = (await db.prepare(
    "SELECT user_id FROM event_registrations WHERE event_id = ? AND status IN ('requested','approved','waitlist')"
  ).all(id)) as unknown as { user_id: number }[];
  await db.prepare("DELETE FROM events WHERE id = ?").run(id);
  for (const p of people) await notify(p.user_id, `O evento "${event!.title}" foi cancelado e excluido pela organizacao.`, "/eventos");
  await audit(user.id, "event.delete", "event", id);
  await alertAdmin(`Evento excluido: "${event!.title}" por ${user.name} (${ROLE_PT[user.role] ?? user.role})`);
  back("/meus-eventos", "msg", `Evento "${event!.title}" excluido.`);
}

export async function requestEventAccess(formData: FormData) {
  const user = await me();
  const eventId = Number(formData.get("event_id"));
  const ret = str(formData, "return") || "/eventos";
  requireVerified(user, ret);
  const db = getDb();
  const event = await db
    .prepare("SELECT * FROM events WHERE id = ? AND status = 'published'")
    .get(eventId) as { id: number; owner_id: number; capacity: number | null; require_approval: number } | undefined;
  if (!event) back(ret, "error", "Evento nao encontrado ou indisponivel.");
  if (event!.owner_id === user.id) back(ret, "error", "Voce nao pode se inscrever no proprio evento.");
  if (formData.get("lgpd") !== "on") {
    back(ret, "error", "Para se inscrever, confirme que leu o aviso de privacidade do evento.");
  }
  const filled = await db
    .prepare("SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ? AND status IN ('requested','approved')")
    .get(eventId) as { count: number };
  const status = event!.capacity !== null && filled.count >= event!.capacity
    ? "waitlist"
    : event!.require_approval
      ? "requested"
      : "approved";
  const communications = formData.get("communications") === "on";
  const image = formData.get("image") === "on";
  const cancelled = (await db
    .prepare("SELECT id, communication_consent, image_consent FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = 'cancelled'")
    .get(eventId, user.id)) as { id: number; communication_consent: number; image_consent: number } | undefined;
  if (cancelled) {
    const again = await db
      .prepare(
        `UPDATE event_registrations SET status = ?, lgpd_accepted_at = datetime('now'), communication_consent = ?, image_consent = ?,
           checked_in_at = NULL, checked_out_at = NULL, safe_home_at = NULL, safe_home_reminded_at = NULL, created_at = datetime('now')
         WHERE id = ? AND status = 'cancelled'`
      )
      .run(status, communications ? 1 : 0, image ? 1 : 0, cancelled.id);
    if (!again.changes) back(ret, "error", "Voce ja possui uma inscricao neste evento.");
    await audit(user.id, "event.registration_requested", "event_registration", cancelled.id);
    await recordConsent(user.id, "event_privacy", true, "inscricao_evento", eventId);
    await recordConsentChanges(user.id, [
      ["event_communications", !!Number(cancelled.communication_consent), communications],
      ["event_image", !!Number(cancelled.image_consent), image],
    ], "inscricao_evento", eventId);
  } else {
    try {
      const result = await db
        .prepare(
          `INSERT INTO event_registrations (event_id, user_id, status, lgpd_accepted_at, communication_consent, image_consent)
           VALUES (?,?,?,datetime('now'),?,?)`
        )
        .run(eventId, user.id, status, communications ? 1 : 0, image ? 1 : 0);
      await audit(user.id, "event.registration_requested", "event_registration", Number(result.lastInsertRowid));
    } catch {
      back(ret, "error", "Voce ja possui uma inscricao neste evento.");
    }
    await recordConsent(user.id, "event_privacy", true, "inscricao_evento", eventId);
    if (communications) await recordConsent(user.id, "event_communications", true, "inscricao_evento", eventId);
    if (image) await recordConsent(user.id, "event_image", true, "inscricao_evento", eventId);
  }
  const messages: Record<string, string> = {
    approved: "Inscricao confirmada.",
    requested: "Solicitacao enviada para aprovacao do organizador.",
    waitlist: "Evento lotado. Voce entrou na lista de espera.",
  };
  back(ret, "msg", messages[status]);
}

export async function updateEventConsents(formData: FormData) {
  const user = await me();
  const eventId = Number(formData.get("event_id"));
  const ret = `/eventos/${eventId}`;
  const db = getDb();
  const reg = await db
    .prepare("SELECT id, communication_consent, image_consent FROM event_registrations WHERE event_id = ? AND user_id = ?")
    .get(eventId, user.id) as { id: number; communication_consent: number; image_consent: number } | undefined;
  if (!reg) back(ret, "error", "Voce nao esta inscrito neste evento.");
  const communications = formData.get("communications") === "on";
  const image = formData.get("image") === "on";
  await db.prepare("UPDATE event_registrations SET communication_consent = ?, image_consent = ? WHERE id = ?")
    .run(communications ? 1 : 0, image ? 1 : 0, reg!.id);
  await recordConsentChanges(user.id, [
    ["event_communications", !!reg!.communication_consent, communications],
    ["event_image", !!reg!.image_consent, image],
  ], "evento", eventId);
  back(ret, "msg", "Permissoes atualizadas.");
}

/** Promove a lista de espera e avisa as pessoas promovidas e o organizador. */
async function fillFromWaitlist(eventId: number, title: string, ownerId: number, actorId: number) {
  const promoted = await promoteWaitlist(eventId, actorId);
  for (const p of promoted) {
    const text = p.status === "approved"
      ? `Abriu uma vaga no evento "${title}" e sua inscricao saiu da lista de espera: ela esta confirmada.`
      : `Abriu uma vaga no evento "${title}" e sua inscricao saiu da lista de espera: agora ela aguarda a aprovacao da organizacao.`;
    await notify(p.userId, text, `/eventos/${eventId}`);
    await emailUser(p.userId, `Abriu uma vaga no evento ${title}`, text, "Ver evento", `/eventos/${eventId}`, "network");
    await notify(ownerId, `${p.name} saiu da lista de espera do evento "${title}" e ${p.status === "approved" ? "esta confirmada" : "aguarda sua aprovacao"}.`, "/dashboard");
  }
  return promoted;
}

export async function cancelEventRegistration(formData: FormData) {
  const user = await me();
  const eventId = Number(formData.get("event_id"));
  const back_to = str(formData, "return");
  const ret = ["/meus-eventos", "/dashboard"].includes(back_to) ? back_to : `/eventos/${eventId}`;
  const db = getDb();
  const reg = (await db.prepare(
    `SELECT r.id, r.status, r.checked_in_at, e.title, e.owner_id, e.starts_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.event_id = ? AND r.user_id = ?`
  ).get(eventId, user.id)) as { id: number; status: string; checked_in_at: string | null; title: string; owner_id: number; starts_at: string } | undefined;
  if (!reg || !["requested", "approved", "waitlist"].includes(reg.status)) back(ret, "error", "Voce nao tem uma inscricao ativa neste evento.");
  if (reg.checked_in_at) back(ret, "error", "Nao e possivel cancelar: sua presenca ja foi registrada.");
  if (eventStarted(reg.starts_at)) back(ret, "error", "Nao e possivel cancelar: o cancelamento vale ate o inicio do evento.");
  if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para cancelar a inscricao.");
  const done = await db.prepare(
    "UPDATE event_registrations SET status = 'cancelled' WHERE id = ? AND status IN ('requested','approved','waitlist') AND checked_in_at IS NULL"
  ).run(reg.id);
  if (!done.changes) back(ret, "error", "Voce nao tem uma inscricao ativa neste evento.");
  await audit(user.id, "event.registration_cancelled", "event_registration", reg.id);
  await notify(reg.owner_id, `${user.name} cancelou a inscricao no evento "${reg.title}".`, "/meus-eventos");
  if (reg.status !== "waitlist") await fillFromWaitlist(eventId, reg.title, reg.owner_id, user.id);
  back(ret, "msg", "Inscricao cancelada.");
}

export async function reviewEventRegistration(formData: FormData) {
  const user = await me();
  if (!isEventOwner(user)) redirect("/dashboard");
  const registrationId = Number(formData.get("registration_id"));
  const decision = str(formData, "decision");
  const ret = str(formData, "return") === "/meus-eventos" ? "/meus-eventos" : "/dashboard";
  const db = getDb();
  const registration = await db
    .prepare(
      `SELECT r.id, r.event_id, e.capacity, e.title
       FROM event_registrations r JOIN events e ON e.id = r.event_id
       WHERE r.id = ? AND e.owner_id = ?`
    )
    .get(registrationId, user.id) as { id: number; event_id: number; capacity: number | null; title: string } | undefined;
  if (!registration || !["approve", "decline"].includes(decision)) {
    back(ret, "error", "Inscricao nao encontrada.");
  }
  if (decision === "approve" && registration!.capacity !== null) {
    const used = await db.prepare("SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ? AND status = 'approved'")
      .get(registration!.event_id) as { count: number };
    if (used.count >= registration!.capacity) back(ret, "error", "O evento ja atingiu a capacidade.");
  }
  await db.prepare("UPDATE event_registrations SET status = ? WHERE id = ?")
    .run(decision === "approve" ? "approved" : "declined", registrationId);
  await audit(user.id, `event.registration_${decision}d`, "event_registration", registrationId);
  if (decision === "approve") back(ret, "msg", "Inscricao aprovada.");
  const promoted = await fillFromWaitlist(registration!.event_id, registration!.title, user.id, user.id);
  back(ret, "msg", promoted.length
    ? `Inscricao recusada. ${promoted.map((p) => p.name).join(", ")} saiu da lista de espera e ocupou a vaga.`
    : "Inscricao recusada.");
}

export async function checkInEvent(formData: FormData) {
  const user = await me();
  if (!isEventOwner(user)) redirect("/dashboard");
  const registrationId = Number(formData.get("registration_id"));
  const db = getDb();
  const row = await db.prepare(
    `SELECT r.id FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.status = 'approved' AND e.owner_id = ?`
  ).get(registrationId, user.id);
  if (!row) back("/dashboard", "error", "Presenca nao encontrada.");
  await db.prepare("UPDATE event_registrations SET checked_in_at = COALESCE(checked_in_at, datetime('now')) WHERE id = ?")
    .run(registrationId);
  await audit(user.id, "event.checked_in", "event_registration", registrationId);
  back("/dashboard", "msg", "Presenca registrada.");
}

export async function selfCheckInEvent(formData: FormData) {
  const user = await me();
  const registrationId = Number(formData.get("registration_id"));
  const ret = str(formData, "return") || "/dashboard";
  const db = getDb();
  const row = (await db.prepare(
    `SELECT r.id, r.checked_in_at, e.title, e.owner_id, e.starts_at, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.user_id = ? AND r.status = 'approved'`
  ).get(registrationId, user.id)) as { id: number; checked_in_at: string | null; title: string; owner_id: number; starts_at: string; ends_at: string } | undefined;
  if (!row) back(ret, "error", "Check-in indisponivel: ele so vale para a sua inscricao confirmada.");
  if (row.checked_in_at) back(ret, "msg", "Seu check-in ja estava registrado.");
  const win = checkInWindow(row.starts_at, row.ends_at);
  if (win.state === "before") back(ret, "error", `O check-in abre em ${spTime(win.opens)}, 30 minutos antes do inicio do evento.`);
  if (win.state === "closed") back(ret, "error", "O check-in foi encerrado: o evento ja terminou.");
  const marked = await db.prepare("UPDATE event_registrations SET checked_in_at = datetime('now') WHERE id = ? AND checked_in_at IS NULL")
    .run(registrationId);
  if (!marked.changes) back(ret, "msg", "Seu check-in ja estava registrado.");
  await audit(user.id, "event.self_checked_in", "event_registration", registrationId);
  if (row.owner_id !== user.id) await notify(row.owner_id, `${user.name} fez check-in no evento "${row.title}".`, "/meus-eventos");
  back(ret, "msg", "Check-in registrado. O organizador foi avisado da sua presenca.");
}

export async function confirmSafeHome(formData: FormData) {
  const user = await me();
  const registrationId = Number(formData.get("registration_id"));
  const ret = str(formData, "return") || "/dashboard";
  const db = getDb();
  const row = (await db.prepare(
    `SELECT r.id, r.safe_home_at, e.id AS event_id, e.title, e.owner_id, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.user_id = ? AND e.modality IN ('in_person','hybrid') AND r.checked_in_at IS NOT NULL`
  ).get(registrationId, user.id)) as { id: number; safe_home_at: string | null; event_id: number; title: string; owner_id: number; ends_at: string } | undefined;
  if (!row || !safeHomeOpen(row.ends_at)) back(ret, "error", "Confirmacao indisponivel: ela so vale ate 2 dias apos o fim de eventos presenciais ou hibridos em que voce fez check-in.");
  if (row.safe_home_at) back(ret, "msg", "Sua chegada ja estava confirmada.");
  await db.prepare("UPDATE event_registrations SET safe_home_at = COALESCE(safe_home_at, datetime('now')) WHERE id = ?")
    .run(registrationId);
  await audit(user.id, "event.safe_home_confirmed", "event_registration", registrationId);
  const text = `${user.name} confirmou que chegou bem em casa apos o evento "${row.title}".`;
  if (row.owner_id !== user.id) {
    await notify(row.owner_id, text, "/meus-eventos");
    await emailUser(row.owner_id, `${user.name} chegou bem em casa`, text, "Ver meus eventos", "/meus-eventos", "network");
  }
  await alertAdmin(text);
  back(ret, "msg", "Confirmacao registrada. Que bom que voce chegou bem! O organizador foi avisado.");
}

export async function updateAvailability(formData: FormData) {
  const user = await me();
  if (user.role !== "mentee") redirect("/dashboard");
  const weekday = Number(formData.get("weekday"));
  const start = str(formData, "start_time");
  const end = str(formData, "end_time");
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) {
    back("/dashboard", "error", "Informe um dia e um intervalo de horario valido.");
  }
  try {
    await getDb().prepare("INSERT INTO availability (user_id, weekday, start_time, end_time) VALUES (?,?,?,?)")
      .run(user.id, weekday, start, end);
  } catch {
    back("/dashboard", "error", "Este horario ja esta na sua disponibilidade.");
  }
  await audit(user.id, "availability.created", "availability", null);
  back("/dashboard", "msg", "Disponibilidade adicionada.");
}

export async function removeAvailability(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("id"));
  await getDb().prepare("DELETE FROM availability WHERE id = ? AND user_id = ?").run(id, user.id);
  await audit(user.id, "availability.deleted", "availability", id);
  back("/dashboard", "msg", "Disponibilidade removida.");
}

export async function scheduleMentorshipMeeting(formData: FormData) {
  const user = await me();
  const mentorshipId = Number(formData.get("mentorship_id"));
  const scheduledAt = str(formData, "scheduled_at");
  const duration = Number(formData.get("duration_minutes") || 60);
  const db = getDb();
  const link = await db.prepare(
    "SELECT id FROM mentorships WHERE id = ? AND status = 'active' AND (mentor_id = ? OR mentee_id = ?)"
  ).get(mentorshipId, user.id, user.id);
  if (!link || !validDateTime(scheduledAt) || !Number.isInteger(duration) || duration < 15 || duration > 480) {
    back("/dashboard", "error", "Nao foi possivel agendar este encontro.");
  }
  const result = await db.prepare(
    "INSERT INTO mentorship_meetings (mentorship_id, scheduled_at, duration_minutes, notes) VALUES (?,?,?,?)"
  ).run(mentorshipId, scheduledAt, duration, str(formData, "notes"));
  await audit(user.id, "mentorship.meeting_scheduled", "mentorship_meeting", Number(result.lastInsertRowid));
  back("/dashboard", "msg", "Encontro de mentoria agendado.");
}

export async function issueCertificate(formData: FormData) {
  const user = await me();
  if (!isEventOwner(user)) redirect("/dashboard");
  requireVerified(user, "/dashboard");
  const recipientId = Number(formData.get("recipient_id"));
  const eventId = Number(formData.get("event_id"));
  const db = getDb();
  const event = await db.prepare("SELECT id, title, ends_at FROM events WHERE id = ? AND owner_id = ?")
    .get(eventId, user.id) as { id: number; title: string; ends_at: string } | undefined;
  const attended = await db.prepare(
    "SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND checked_in_at IS NOT NULL"
  ).get(eventId, recipientId);
  if (!event || !attended) back("/dashboard", "error", "Certificados so podem ser emitidos para participantes presentes.");
  if (!canIssueCertificate(event!.ends_at)) back("/dashboard", "error", CERTIFICATE_EXPIRED);
  const code = crypto.randomBytes(9).toString("hex").toUpperCase();
  try {
    const result = await db.prepare(
      "INSERT INTO certificates (user_id, event_id, issued_by, title, verification_code) VALUES (?,?,?,?,?)"
    ).run(recipientId, eventId, user.id, event!.title, code);
    await audit(user.id, "certificate.issued", "certificate", Number(result.lastInsertRowid));
  } catch {
    back("/dashboard", "error", "Ja existe certificado para esta pessoa neste evento.");
  }
  redirect(`/certificados/${code}`);
}

const CERTIFICATE_EXPIRED = "O prazo para emitir o certificado terminou 1 ano apos o fim do evento.";

export async function selfIssueCertificate(formData: FormData) {
  const user = await me();
  requireVerified(user, "/dashboard");
  const db = getDb();
  const reg = (await db.prepare(
    `SELECT r.event_id, e.title, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.user_id = ? AND r.checked_in_at IS NOT NULL`
  ).get(Number(formData.get("registration_id")), user.id)) as { event_id: number; title: string; ends_at: string } | undefined;
  if (!reg) back("/dashboard", "error", "Certificados so podem ser emitidos por quem fez check-in no evento.");
  const existing = (await db.prepare("SELECT verification_code FROM certificates WHERE user_id = ? AND event_id = ?")
    .get(user.id, reg!.event_id)) as { verification_code: string } | undefined;
  if (existing) redirect(`/certificados/${existing.verification_code}`);
  if (!canIssueCertificate(reg!.ends_at)) back("/dashboard", "error", CERTIFICATE_EXPIRED);
  const code = crypto.randomBytes(9).toString("hex").toUpperCase();
  try {
    const result = await db.prepare(
      "INSERT INTO certificates (user_id, event_id, issued_by, title, verification_code) VALUES (?,?,?,?,?)"
    ).run(user.id, reg!.event_id, user.id, reg!.title, code);
    await audit(user.id, "certificate.self_issued", "certificate", Number(result.lastInsertRowid));
  } catch {
    back("/dashboard", "error", "Ja existe certificado seu neste evento.");
  }
  redirect(`/certificados/${code}`);
}

async function returnPath(): Promise<string> {
  const ref = (await headers()).get("referer");
  if (!ref) return "/dashboard";
  try {
    const u = new URL(ref);
    return safeReturn(`${u.pathname}${u.search.replace(/[?&](msg|error)=[^&]*/g, "").replace(/^&/, "?")}`, "/dashboard");
  } catch {
    return "/dashboard";
  }
}

export async function resendEmailVerification() {
  const user = await me();
  const ret = await returnPath();
  if (user.email_status !== "pending") back(ret, "msg", "Seu e-mail ja esta confirmado.");
  const limit = [{ action: "verify_resend", subject: `user:${user.id}`, max: 3, windowMin: 60 }];
  const wait = await blockedFor(limit);
  if (wait) back(ret, "error", tooManyMessage(wait));
  await recordAttempt("verify_resend", [`user:${user.id}`]);
  await sendEmailVerification(user.id, user.email, user.name, user.role);
  back(ret, "msg", `Enviamos um novo e-mail de confirmacao para ${user.email}.`);
}

export async function confirmEmail(formData: FormData) {
  const token = str(formData, "token");
  const target = await verificationTarget(token);
  if (!target) redirect("/verificar-email?status=invalido");
  if (target!.expired) redirect("/verificar-email?status=vencido");
  await getDb().prepare("UPDATE users SET email_status = 'verified', email_verified_at = datetime('now') WHERE id = ?").run(target!.user_id);
  await markVerificationUsed(token);
  await audit(target!.user_id, "email.verified", "user", target!.user_id);
  redirect("/verificar-email?status=confirmado");
}

export async function disputeAccount(formData: FormData) {
  const token = str(formData, "token");
  const target = await verificationTarget(token);
  if (!target) redirect("/verificar-email?status=invalido");
  const db = getDb();
  await db.prepare("UPDATE users SET account_status = 'disputed', email_status = 'disputed' WHERE id = ?").run(target!.user_id);
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target!.user_id);
  await markVerificationUsed(token);
  await audit(null, "account.disputed", "user", target!.user_id);
  await alertAdmin(`Cadastro contestado pelo dono do e-mail: ${target!.name} (${ROLE_PT[target!.role] ?? target!.role}). A conta foi desativada.`);
  redirect("/verificar-email?status=desativada");
}

const MY_DATA = "/meus-dados";

export async function updateName(formData: FormData) {
  const user = await me();
  const name = str(formData, "name").slice(0, 120);
  if (name.length < 2) back(MY_DATA, "error", "Informe o nome com pelo menos 2 caracteres.");
  if (name === user.name) back(MY_DATA, "msg", "O nome continua o mesmo.");
  await getDb().prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id);
  await audit(user.id, "user.name_changed", "user", user.id);
  back(MY_DATA, "msg", "Nome atualizado.");
}

export async function requestEmailChange(formData: FormData) {
  const user = await me();
  const email = str(formData, "email").slice(0, 200).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const limit = { action: "email_change", subject: `user:${user.id}`, max: 5, windowMin: 60 };
  const wait = await blockedFor([limit]);
  if (wait) back(MY_DATA, "error", tooManyMessage(wait));
  if (!EMAIL_RE.test(email)) back(MY_DATA, "error", "Informe um email valido, por exemplo nome@dominio.com.");
  if (email === user.email.toLowerCase()) back(MY_DATA, "error", "Este ja e o seu e-mail atual.");
  const db = getDb();
  const row = (await db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id)) as { password_hash: string } | undefined;
  await recordAttempt("email_change", [limit.subject]);
  if (!row || !verifyPassword(password, row.password_hash)) back(MY_DATA, "error", "Senha incorreta. O e-mail nao foi alterado.");
  if (await db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email)) {
    back(MY_DATA, "error", "Este e-mail ja esta em uso em outra conta.");
  }
  const token = await createEmailChange(user.id, email);
  const link = `${await siteUrl()}/meus-dados/confirmar-email?token=${token}`;
  after(() =>
    sendPlainEmail(email, "confirme seu novo e-mail", [
      `Ola, ${user.name}!`,
      "Voce pediu para trocar o e-mail da sua conta na Ponte para este endereco. Para concluir, clique no botao abaixo. O link vale por 24 horas e so pode ser usado uma vez.",
      "Se nao foi voce, ignore este e-mail. Nada sera alterado.",
    ], { label: "Confirmar meu novo e-mail", link })
  );
  await audit(user.id, "email.change_requested", "user", user.id);
  back(MY_DATA, "msg", `Enviamos um link de confirmacao para ${email}. Seu e-mail so muda depois do clique nesse link.`);
}

export async function confirmEmailChange(formData: FormData) {
  const token = str(formData, "token");
  const target = await emailChangeTarget(token);
  const done = (status: string) => redirect(`/meus-dados/confirmar-email?status=${status}`);
  if (!target) done("invalido");
  if (target!.expired) done("vencido");
  const db = getDb();
  if (await db.prepare("SELECT id FROM users WHERE lower(email) = ? AND id <> ?").get(target!.new_email, target!.user_id)) done("em-uso");
  try {
    await db
      .prepare("UPDATE users SET email = ?, email_status = 'verified', email_verified_at = datetime('now') WHERE id = ?")
      .run(target!.new_email, target!.user_id);
  } catch {
    done("em-uso");
  }
  await markEmailChangeUsed(token);
  await audit(target!.user_id, "email.changed", "user", target!.user_id);
  after(() =>
    sendPlainEmail(target!.old_email, "seu e-mail foi trocado", [
      `Ola, ${target!.name}!`,
      `O e-mail da sua conta na Ponte foi trocado para ${target!.new_email}. A partir de agora, use o novo e-mail para entrar.`,
      "Se nao foi voce, avise a administracao da Ponte.",
    ])
  );
  done("confirmado");
}

export async function createDataRequest(formData: FormData) {
  const user = await me();
  const kind = str(formData, "kind") as RequestKind;
  const message = str(formData, "message").slice(0, 2000);
  if (!REQUEST_KINDS.includes(kind)) back(MY_DATA, "error", "Escolha o tipo do pedido.");
  if ((kind === "correcao" || kind === "outro") && !message) back(MY_DATA, "error", "Descreva o seu pedido.");
  const limit = { action: "data_request", subject: `user:${user.id}`, max: 5, windowMin: 24 * 60 };
  const wait = await blockedFor([limit]);
  if (wait) back(MY_DATA, "error", tooManyMessage(wait));
  await recordAttempt("data_request", [limit.subject]);
  const result = await getDb().prepare("INSERT INTO data_requests (user_id, kind, message) VALUES (?,?,?)").run(user.id, kind, message);
  await audit(user.id, "data_request.created", "data_request", Number(result.lastInsertRowid));
  await alertAdmin(`Novo pedido sobre dados (${REQUEST_KIND_PT[kind]}) de ${user.name}. Responda em Pedidos LGPD.`);
  back(MY_DATA, "msg", "Pedido enviado. A resposta vai aparecer aqui, em ate 15 dias.");
}

export async function answerDataRequest(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("id"));
  const response = str(formData, "response").slice(0, 4000);
  if (!response) back("/admin/pedidos", "error", "Escreva a resposta antes de concluir o pedido.");
  const db = getDb();
  const req = (await db.prepare("SELECT user_id FROM data_requests WHERE id = ? AND status = 'open'").get(id)) as { user_id: number } | undefined;
  if (!req) back("/admin/pedidos", "error", "Pedido nao encontrado ou ja respondido.");
  await db.prepare("UPDATE data_requests SET status = 'done', response = ?, answered_at = datetime('now') WHERE id = ?").run(response, id);
  await audit(null, "data_request.answered", "data_request", id);
  await notify(req!.user_id, "Seu pedido sobre seus dados foi respondido.", MY_DATA);
  await emailUser(req!.user_id, "seu pedido sobre seus dados foi respondido", "A administracao da Ponte respondeu ao seu pedido sobre seus dados.", "Ver a resposta", MY_DATA, "essential");
  back("/admin/pedidos", "msg", "Pedido respondido e concluido.");
}

export async function saveEmailPreferences(formData: FormData) {
  const user = await me();
  const next = {
    email_network: formData.get("email_network") === "on",
    email_reminders: formData.get("email_reminders") === "on",
    news: formData.get("news") === "on",
  };
  const db = getDb();
  const row = (await db.prepare("SELECT email_network, email_reminders, news_consent FROM users WHERE id = ?").get(user.id)) as
    { email_network: number; email_reminders: number; news_consent: number };
  await db
    .prepare("UPDATE users SET email_network = ?, email_reminders = ?, news_consent = ? WHERE id = ?")
    .run(next.email_network ? 1 : 0, next.email_reminders ? 1 : 0, next.news ? 1 : 0, user.id);
  await recordConsentChanges(user.id, [
    ["email_network", !!Number(row.email_network), next.email_network],
    ["email_reminders", !!Number(row.email_reminders), next.email_reminders],
    ["news", !!Number(row.news_consent), next.news],
  ], "meus_dados");
  back(MY_DATA, "msg", "Preferencias de e-mail salvas.");
}
