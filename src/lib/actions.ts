"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import { audit, getDb, getProfile, hashPassword, notify, saveProfile, verifyPassword, type User } from "./db";
import {
  clearAdminPending,
  clearAdminSetup,
  createAdminPending,
  createAdminSession,
  createAdminSetup,
  createSession,
  destroyAdminSession,
  destroySession,
  getSessionUser,
  hasAdminPending,
  hasAdminSetup,
  isAdmin,
} from "./auth";
import { activeTwoFactor, checkSecondFactor, disableTwoFactor, enableTwoFactor, twoFactorResetOn } from "./admin-2fa";
import { closeAllAdminSessions } from "./admin-sessions";
import { alertAdmin, ROLE_PT } from "./admin-alert";
import { passwordProblem } from "./password-policy";
import { emailUser } from "./user-email";
import { bareUrl } from "./url";
import { checkInWindow, checkOutOpen, eventEnded, eventStarted, spTime } from "./event-time";
import { adminLoginLimits, claimOwnerWarning, clearLoginAttempts, loginLimits, passwordMatches, progressiveWait, sameSecret, waitSecondsMessage } from "./login-guard";
import { looksLikeBot, signupAlertText, SIGNUP_SITE_LIMIT } from "./signup-guard";
import { blockedFor, recordAttempt, tooManyMessage } from "./rate-limit";
import { clientIp, requireVerified, safeReturn, siteUrl } from "./session";
import { pendingLegalDocs, recordLegalAcceptance } from "./legal-acceptance";
import { recordConsent, recordConsentChanges } from "./consents";
import { canIssueCertificate, safeHomeOpen } from "./retention";
import { promoteWaitlist } from "./waitlist";
import { ATTACH_LIMIT, ATTACH_SCOPES, ATTACH_SITE_TOTAL, crossesSiteWarning, siteAttachmentBytes, ATTACH_TITLE_MAX, ATTACH_USER_TOTAL, SCOPE_MAX, attachmentPath, canRemoveAttachment, canViewAttachment, fileProblem, getAttachment, safeFilename, sniffType, uploadDenied, userAttachmentBytes, whereFor, type AttachScope, type AttachTarget } from "./attachments";
import { eventReviewTarget, mentorshipReviewTarget, myReview, reviewProblem } from "./reviews";
import { REPORT_LIMIT, REPORT_REASONS, blockedBetween, reportProblem, type ReportOutcome, type ReportTarget } from "./moderation";
import { eventHasHistory } from "./event-history";
import { validCertificateTheme } from "./certificate-themes";
import { recordCertificateHistory, workloadMinutes } from "./certificates";
import { revokeReason } from "./certificate-revoke";
import { MEETING_COL, MEETING_TABLE, canConfirmMeeting, listMeetings, meetingPath, meetingStarted, meetingTime, parseMeetingRef, type Meeting, type MeetingKind } from "./meetings";
import {
  REQUEST_KIND_PT, REQUEST_KINDS, createEmailChange, emailChangeTarget, markEmailChangeUsed, sendPlainEmail, type RequestKind,
} from "./my-data";
import { MESSAGE_EMAIL_GAP_MIN, MESSAGE_LIMIT, canMessageDirect, conversationBetween, getConversation, messageProblem, otherOf, pair, type ConversationRow } from "./messages";
import { MENTEE_EVENT_CATEGORIES } from "./catalog";
import { PENDING_EVENTS_MAX, REJECT_REASON_MAX, addInvite as addEventInvite, approveEvent, declineInvite, pendingEventCount, rejectEvent } from "./event-invites";
import { DELETE_KINDS, DELETE_KIND_PT, DELETE_REASON_MAX, deleteAsAdmin, type DeleteKind } from "./admin-delete";
import { adminConfirmEmail, createVerificationToken, sendVerificationEmail, markVerificationUsed, verificationTarget } from "./email-verification";

const LINK_RE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;
const WEBSITE_MAX = 500;

async function nameOf(id: number): Promise<string> {
  const r = (await getDb().prepare("SELECT name FROM users WHERE id = ?").get(id)) as { name: string } | undefined;
  return r?.name ?? "alguem";
}

function back(path: string, key: "msg" | "error", text: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(text)}`);
}

const PRESENCE_RETURN = ["/dashboard", "/meus-eventos", "/eventos-participantes"];

function presenceReturn(formData: FormData): string {
  const ret = String(formData.get("return") ?? "").trim();
  return PRESENCE_RETURN.includes(ret) ? ret : "/dashboard";
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
  return user.role === "mentor" || user.role === "company" || user.role === "mentee";
}

function validDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function adminLogin(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const ip = await clientIp();
  const limits = adminLoginLimits(ip);
  const wait = await blockedFor([limits.ip, limits.site]);
  if (wait) back("/admin/login", "error", tooManyMessage(wait));
  const expected = process.env.ADMIN_PASSWORD;
  const emailOk = sameSecret(email, (process.env.ADMIN_EMAIL ?? "").toLowerCase());
  const passwordOk = sameSecret(password, expected ?? "");
  if (!expected || !emailOk || !passwordOk) {
    await recordAttempt("admin_login", [limits.ip.subject, limits.site.subject]);
    if (await blockedFor([limits.site])) await alertAdmin("Login da administracao bloqueado por 1 hora depois de 20 tentativas erradas vindas de varios IPs");
    else if (await blockedFor([limits.ip])) await alertAdmin("Login da administracao bloqueado por 15 minutos depois de 5 tentativas erradas");
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
  } else {
    await createAdminSetup();
    redirect("/admin/seguranca");
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
  if (!(await isAdmin()) && !(await hasAdminSetup())) redirect("/admin/login");
  if (twoFactorResetOn()) back("/admin/seguranca", "error", "Remova ADMIN_2FA_RESET da Vercel antes de ativar.");
  const codes = await enableTwoFactor(str(formData, "code").replace(/\s/g, ""));
  if (!codes) back("/admin/seguranca", "error", "Codigo invalido. Confira o codigo atual no aplicativo e tente de novo.");
  await audit(null, "admin.2fa_enabled", "admin", null);
  await clearAdminSetup();
  await createAdminSession();
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
  await destroyAdminSession();
  await closeAllAdminSessions();
  await createAdminSetup();
  back("/admin/seguranca", "msg", "Aplicativo antigo desligado. Leia o novo QR code para voltar ao painel.");
}

export async function adminLogout() {
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function adminLogoutEverywhere() {
  if (!(await isAdmin())) redirect("/admin/login");
  await destroyAdminSession();
  await closeAllAdminSessions();
  await audit(null, "admin.sessions_closed", "admin", null);
  back("/admin/login", "msg", "Todas as sessoes da administracao foram encerradas, inclusive esta. Entre de novo.");
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
  const limits = loginLimits(email, ip);
  const wait = await blockedFor([limits.pair, limits.email, limits.ip]);
  if (wait) back(loginPage, "error", tooManyMessage(wait));
  const seconds = await progressiveWait(limits.pair);
  if (seconds) back(loginPage, "error", waitSecondsMessage(seconds));
  const user = await getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | User
    | undefined;
  if (!passwordMatches(password, user?.password_hash) || !user) {
    await recordAttempt("login", [limits.pair.subject, limits.email.subject, limits.ip.subject]);
    if (user && (await blockedFor([limits.pair, limits.email])) && (await claimOwnerWarning(email))) {
      await emailUser(
        user.id,
        "Varias tentativas de entrar na sua conta",
        "Houve varias tentativas de entrar na sua conta com a senha errada. Por seguranca, novas tentativas foram bloqueadas por um tempo. Se nao foi voce, recomendamos trocar sua senha: isso tambem libera o login na hora.",
        "Trocar minha senha",
        "/esqueci-senha",
        "essential"
      );
    }
    back(loginPage, "error", "Email ou senha incorretos.");
  }
  await clearLoginAttempts(email);
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
  if (user!.account_status === "suspended") {
    back(loginPage, "error", "Esta conta foi suspensa pela administracao por descumprir o Codigo de Conduta. Fale com o administrador.");
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
  if (looksLikeBot(formData)) back(ret, "error", "Nao foi possivel criar a conta. Aguarde alguns segundos e tente de novo.");
  const wait = await blockedFor([{ action: "signup", subject: `ip:${ip}`, max: 20, windowMin: 60 }]);
  if (wait) back(ret, "error", tooManyMessage(wait));
  const repeatedLimit = { action: "signup_repeated", subject: `ip:${ip}`, max: 5, windowMin: 60 };
  const repeatedWait = await blockedFor([repeatedLimit]);
  if (repeatedWait) back(ret, "error", tooManyMessage(repeatedWait));
  const siteWait = await blockedFor([SIGNUP_SITE_LIMIT]);
  if (siteWait) back(ret, "error", `Muitos cadastros agora. Tente de novo em ${siteWait} minuto${siteWait > 1 ? "s" : ""}.`);
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
    await recordAttempt(repeatedLimit.action, [repeatedLimit.subject]);
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
  await recordAttempt("signup", [`ip:${ip}`, SIGNUP_SITE_LIMIT.subject]);
  await sendEmailVerification(newUserId, email, name, role);
  await audit(null, REQUIRE_APPROVAL ? "account.requested" : "account.created", "user", newUserId);
  const alertText = await signupAlertText(`Novo cadastro de ${ROLE_PT[role]}: ${name}${REQUIRE_APPROVAL ? " (aguardando aprovacao)" : ""}`);
  if (alertText) await alertAdmin(alertText);
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
  await getDb().prepare("DELETE FROM certificate_history WHERE certificate_id IN (SELECT id FROM certificates WHERE user_id = ?)").run(user.id);
  await getDb().prepare("UPDATE messages SET body = NULL WHERE sender_id = ?").run(user.id);
  await getDb().prepare("DELETE FROM attachments WHERE owner_id = ?").run(user.id);
  await getDb().prepare("UPDATE project_tasks SET assignee_id = NULL WHERE assignee_id = ?").run(user.id);
  await getDb().prepare("UPDATE project_tasks SET created_by = NULL WHERE created_by = ?").run(user.id);
  await getDb().prepare("UPDATE project_deliveries SET author_id = NULL WHERE author_id = ?").run(user.id);
  await getDb().prepare("UPDATE project_deliveries SET reviewer_id = NULL WHERE reviewer_id = ?").run(user.id);
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
  if (await blockedBetween(user.id, mentorId)) back(ret, "error", "Nao e possivel enviar este pedido para esta pessoa.");
  try {
    const reopened = await getDb()
      .prepare("UPDATE mentorships SET status = 'pending', requested_by = 'mentee', objective = ?, message = ? WHERE mentor_id = ? AND mentee_id = ? AND status = 'completed'")
      .run(str(formData, "objective").slice(0, 300), str(formData, "message").slice(0, 1000), mentorId, user.id);
    if (!Number(reopened.changes)) await getDb()
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
  if (await blockedBetween(user.id, menteeId)) back(ret, "error", "Nao e possivel enviar este convite para esta pessoa.");
  try {
    const reopened = await getDb()
      .prepare("UPDATE mentorships SET status = 'pending', requested_by = 'mentor', objective = ?, message = ? WHERE mentor_id = ? AND mentee_id = ? AND status = 'completed'")
      .run(str(formData, "objective").slice(0, 300), str(formData, "message").slice(0, 1000), user.id, menteeId);
    if (!Number(reopened.changes)) await getDb()
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
  if (await blockedBetween(user.id, memberId)) back(ret, "error", "Nao e possivel enviar este convite para esta pessoa.");
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
  if (!formData.get("skip_review") && (await mentorshipReviewTarget(user.id, id))) {
    redirect(`/avaliar?mentoria=${id}&encerrar=1`);
  }
  await getDb()
    .prepare("DELETE FROM mentorships WHERE id = ? AND (mentor_id = ? OR mentee_id = ?)")
    .run(id, user.id, user.id);
  back("/dashboard", "msg", "Conexao removida.");
}

/** 2A: conclui a mentoria depois do 1o encontro concluido. Ela sai das ativas e o historico fica guardado. */
export async function completeMentorship(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("id")) || 0;
  const ret = safeReturn(str(formData, "return"), "/minha-rede");
  const db = getDb();
  const m = (await db.prepare(
    `SELECT id, mentor_id, mentee_id FROM mentorships WHERE id = ? AND status = 'active' AND (mentor_id = ? OR mentee_id = ?)
     AND EXISTS (SELECT 1 FROM mentorship_meetings mm WHERE mm.mentorship_id = mentorships.id AND mm.status = 'completed')`
  ).get(id, user.id, user.id)) as { id: number; mentor_id: number; mentee_id: number } | undefined;
  if (!m) back(ret, "error", "A mentoria pode ser concluida depois do primeiro encontro concluido.");
  await db.prepare("UPDATE mentorships SET status = 'completed', completed_at = datetime('now'), completed_by = ? WHERE id = ?").run(user.id, id);
  await db.prepare("UPDATE mentorship_meetings SET status = 'cancelled' WHERE mentorship_id = ? AND status = 'scheduled'").run(id);
  const other = m!.mentor_id === user.id ? m!.mentee_id : m!.mentor_id;
  const text = `${user.name} concluiu a mentoria de voces. O historico fica guardado e conta no impacto de voces na Ponte.`;
  await notify(other, text, "/minha-rede");
  await emailUser(other, "Mentoria concluida", text, "Ver minha rede", "/minha-rede", "network");
  await audit(user.id, "mentorship.completed", "mentorship", id);
  if (!(await myReview(user.id, "mentorship", id))) {
    redirect(`/avaliar?mentoria=${id}&msg=${encodeURIComponent("Mentoria concluida. Quer avaliar a mentoria?")}`);
  }
  back(ret, "msg", "Mentoria concluida. O historico fica guardado.");
}

/** 1C: a pessoa escolhe mostrar os proprios indicadores no perfil publico. */
export async function setImpactVisibility(formData: FormData) {
  const user = await me();
  const show = formData.get("show_impact") === "1";
  await saveProfile(user.id, { ...(await getProfile(user.id)), show_impact: show });
  await audit(user.id, show ? "profile.impact_shown" : "profile.impact_hidden", "user", user.id);
  back("/dashboard", "msg", show ? "Seu impacto aparece no seu perfil publico." : "Seu impacto deixou de aparecer no perfil publico.");
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
  const mentee = user.role === "mentee";
  if (mentee && !MENTEE_EVENT_CATEGORIES.includes(str(formData, "category"))) back("/dashboard", "error", "Escolha a categoria do evento.");
  if (mentee && (await pendingEventCount(user.id)) >= PENDING_EVENTS_MAX) {
    back("/dashboard", "error", `Voce ja tem ${PENDING_EVENTS_MAX} eventos aguardando aprovacao. Espere a resposta da administracao para enviar outro.`);
  }

  const title = str(formData, "title");
  const modality = str(formData, "modality");
  const startsAt = str(formData, "starts_at");
  const endsAt = str(formData, "ends_at");
  const onlineUrl = bareUrl(str(formData, "online_url"));
  const websiteUrl = bareUrl(str(formData, "website_url"));
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
  if (websiteUrl && (websiteUrl.length > WEBSITE_MAX || !LINK_RE.test(websiteUrl))) {
    back("/dashboard", "error", "Site oficial do evento: informe um endereco valido, por exemplo lu.ma/meu-evento");
  }
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) {
    back("/dashboard", "error", "A capacidade deve ser um numero inteiro maior que zero.");
  }

  const result = await getDb()
    .prepare(
      `INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location, capacity, require_approval, category, city, state, organizer, certificate_theme, status, approval_status, website_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      user.id, title, str(formData, "description"), modality, startsAt, endsAt,
      onlineUrl, location, capacity, formData.get("require_approval") === "on" ? 1 : 0,
      str(formData, "category"), str(formData, "city"), str(formData, "state").toUpperCase().slice(0, 2),
      str(formData, "organizer") || user.name, validCertificateTheme(str(formData, "certificate_theme")),
      mentee ? "draft" : "published", mentee ? "pending" : "approved", websiteUrl
    );
  const eventId = Number(result.lastInsertRowid);
  await audit(user.id, "event.created", "event", eventId);
  if (mentee) {
    await alertAdmin(`Evento aguardando aprovacao: "${title}" por ${user.name} (${ROLE_PT[user.role] ?? user.role}). Aprove ou recuse em Admin > Eventos.`);
    back(`/eventos/${eventId}`, "msg", "Evento enviado para a aprovacao da administracao. Ja pode convidar pessoas: os convites saem quando ele for aprovado.");
  }
  back("/dashboard", "msg", "Evento publicado e pronto para receber inscricoes.");
}

type EditableEvent = {
  id: number; title: string; owner_id: number; status: string; approval_status: string; modality: string; starts_at: string; ends_at: string;
  online_url: string; location: string; city: string; state: string;
};

export async function updateEvent(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("event_id"));
  const ret = `/meus-eventos/${Number.isInteger(id) && id > 0 ? id : 0}/editar`;
  const db = getDb();
  const event = (await db.prepare(
    "SELECT id, title, owner_id, status, approval_status, modality, starts_at, ends_at, online_url, location, city, state FROM events WHERE id = ? AND owner_id = ?"
  ).get(id, user.id)) as EditableEvent | undefined;
  if (!event) back("/meus-eventos", "error", "Evento nao encontrado ou voce nao e quem o cadastrou.");
  if (event.status === "cancelled") back("/meus-eventos", "error", "Evento cancelado nao pode ser editado.");
  if (event.approval_status === "rejected") back("/meus-eventos", "error", "Evento recusado pela administracao nao pode ser editado.");
  if (user.role === "mentee" && !MENTEE_EVENT_CATEGORIES.includes(str(formData, "category"))) back(ret, "error", "Escolha a categoria do evento.");
  if (eventEnded(event.ends_at)) back("/meus-eventos", "error", "O evento ja terminou e nao pode mais ser editado.");

  const title = str(formData, "title");
  const modality = str(formData, "modality");
  const startsAt = str(formData, "starts_at");
  const endsAt = str(formData, "ends_at");
  const onlineUrl = bareUrl(str(formData, "online_url"));
  const websiteUrl = bareUrl(str(formData, "website_url"));
  const location = str(formData, "location");
  const city = str(formData, "city");
  const state = str(formData, "state").toUpperCase().slice(0, 2);
  const capacityText = str(formData, "capacity");
  const capacity = capacityText ? Number(capacityText) : null;

  if (!title || !EVENT_MODALITIES.includes(modality) || !validDateTime(startsAt) || !validDateTime(endsAt)) {
    back(ret, "error", "Preencha titulo, modalidade e datas validas.");
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) back(ret, "error", "O termino deve acontecer depois do inicio.");
  if ((modality === "online" || modality === "hybrid") && !onlineUrl) back(ret, "error", "Informe o link para o evento online.");
  if (onlineUrl && !LINK_RE.test(onlineUrl)) {
    back(ret, "error", "Link do encontro: informe um endereco valido, por exemplo meet.google.com/abc-defg-hij");
  }
  if ((modality === "in_person" || modality === "hybrid") && !location) back(ret, "error", "Informe o local do evento presencial.");
  if (websiteUrl && (websiteUrl.length > WEBSITE_MAX || !LINK_RE.test(websiteUrl))) {
    back(ret, "error", "Site oficial do evento: informe um endereco valido, por exemplo lu.ma/meu-evento");
  }
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) {
    back(ret, "error", "A capacidade deve ser um numero inteiro maior que zero.");
  }
  const approved = (await db.prepare("SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ? AND status = 'approved'").get(id)) as { count: number };
  if (capacity !== null && capacity < Number(approved.count)) {
    back(ret, "error", `O evento ja tem ${approved.count} inscricoes confirmadas. As vagas nao podem ficar abaixo disso.`);
  }

  await db.prepare(
    `UPDATE events SET title = ?, description = ?, modality = ?, starts_at = ?, ends_at = ?, online_url = ?, location = ?, capacity = ?,
       require_approval = ?, category = ?, city = ?, state = ?, certificate_theme = ?, website_url = ? WHERE id = ? AND owner_id = ?`
  ).run(
    title, str(formData, "description"), modality, startsAt, endsAt, onlineUrl, location, capacity,
    formData.get("require_approval") === "on" ? 1 : 0, str(formData, "category"), city, state, validCertificateTheme(str(formData, "certificate_theme")), websiteUrl, id, user.id
  );
  await audit(user.id, "event.updated", "event", id);

  const changes: string[] = [];
  if (event.starts_at !== startsAt || event.ends_at !== endsAt) changes.push("data e horario");
  if (event.modality !== modality) changes.push("modalidade");
  if (event.online_url !== onlineUrl) changes.push("link");
  if (event.location !== location || event.city !== city || event.state !== state) changes.push("local");
  if (changes.length) {
    const people = (await db.prepare(
      "SELECT user_id FROM event_registrations WHERE event_id = ? AND status IN ('requested','approved','waitlist')"
    ).all(id)) as unknown as { user_id: number }[];
    const text = `O evento "${title}" foi alterado pela organizacao: ${changes.join(", ")}. Confira os detalhes na pagina do evento.`;
    for (const p of people) {
      await notify(p.user_id, text, `/eventos/${id}`);
      await emailUser(p.user_id, `Evento alterado: ${title}`, text, "Ver evento", `/eventos/${id}`, "network");
    }
  }
  const promoted = await fillFromWaitlist(id, title, user.id, user.id);
  const extra = promoted.length ? ` ${promoted.length} pessoa(s) sairam da lista de espera.` : "";
  back("/meus-eventos", "msg", `Evento "${title}" atualizado.${changes.length ? " As pessoas inscritas foram avisadas." : ""}${extra}`);
}

export async function deleteEvent(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("event_id"));
  const ret = str(formData, "return").startsWith("/") ? str(formData, "return") : "/meus-eventos";
  const db = getDb();
  const event = (await db.prepare("SELECT id, title, status FROM events WHERE id = ? AND owner_id = ?").get(id, user.id)) as { id: number; title: string; status: string } | undefined;
  if (!event) back("/meus-eventos", "error", "Evento nao encontrado ou voce nao e quem o cadastrou.");
  if (event.status === "cancelled") back(ret, "msg", `O evento "${event.title}" ja estava cancelado.`);
  const people = (await db.prepare(
    "SELECT user_id FROM event_registrations WHERE event_id = ? AND status IN ('requested','approved','waitlist')"
  ).all(id)) as unknown as { user_id: number }[];
  if (await eventHasHistory(id)) {
    if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para cancelar o evento.");
    const done = await db.prepare("UPDATE events SET status = 'cancelled' WHERE id = ? AND status <> 'cancelled'").run(id);
    if (!done.changes) back(ret, "msg", `O evento "${event.title}" ja estava cancelado.`);
    const text = `O evento "${event.title}" foi cancelado pela organizacao.`;
    for (const p of people) {
      await notify(p.user_id, text, `/eventos/${id}`);
      await emailUser(p.user_id, `Evento cancelado: ${event.title}`, text, "Ver evento", `/eventos/${id}`, "network");
    }
    await audit(user.id, "event.cancelled", "event", id);
    await alertAdmin(`Evento cancelado: "${event.title}" por ${user.name} (${ROLE_PT[user.role] ?? user.role})`);
    back(ret, "msg", `Evento "${event.title}" cancelado. O historico foi mantido.`);
  }
  if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para excluir o evento.");
  await db.prepare("DELETE FROM attachments WHERE event_id = ?").run(id);
  await db.prepare("DELETE FROM events WHERE id = ?").run(id);
  for (const p of people) await notify(p.user_id, `O evento "${event!.title}" foi cancelado e excluido pela organizacao.`, "/eventos");
  await audit(user.id, "event.delete", "event", id);
  await alertAdmin(`Evento excluido: "${event!.title}" por ${user.name} (${ROLE_PT[user.role] ?? user.role})`);
  back("/meus-eventos", "msg", `Evento "${event!.title}" excluido.`);
}

export async function inviteToEvent(formData: FormData) {
  const user = await me();
  const eventId = Number(formData.get("event_id"));
  const ret = `/eventos/${Number.isInteger(eventId) && eventId > 0 ? eventId : 0}`;
  if (user.role !== "mentee") back(ret, "error", "Convites sao feitos pelos mentorados que organizam o evento.");
  requireVerified(user, ret);
  const event = (await getDb().prepare("SELECT id, title, owner_id, status, approval_status, ends_at FROM events WHERE id = ? AND owner_id = ?")
    .get(eventId, user.id)) as { id: number; title: string; owner_id: number; status: string; approval_status: string; ends_at: string } | undefined;
  if (!event) back("/meus-eventos", "error", "Evento nao encontrado ou voce nao e quem o cadastrou.");
  if (event.status === "cancelled" || event.approval_status === "rejected" || eventEnded(event.ends_at)) back(ret, "error", "Este evento nao aceita mais convites.");
  const published = event.status === "published";
  const outcome = await addEventInvite(event, user.name, Number(formData.get("user_id")), published);
  const errors: Record<string, string> = {
    self: "Voce organiza este evento.",
    not_found: "Pessoa nao encontrada.",
    blocked: "Nao e possivel convidar esta pessoa.",
    full: "Este evento ja tem 50 convites, o maximo.",
    duplicate: "Esta pessoa ja foi convidada.",
  };
  if (outcome !== "ok") back(ret, "error", errors[outcome]);
  await audit(user.id, "event.invited", "event", eventId);
  back(ret, "msg", published ? "Convite enviado." : "Convite guardado. Ele sai quando a administracao aprovar o evento.");
}

export async function declineEventInvite(formData: FormData) {
  const user = await me();
  const eventId = Number(formData.get("event_id"));
  const ret = `/eventos/${Number.isInteger(eventId) && eventId > 0 ? eventId : 0}`;
  if (!(await declineInvite(eventId, user.id))) back(ret, "error", "Convite nao encontrado.");
  const event = (await getDb().prepare("SELECT title, owner_id FROM events WHERE id = ?").get(eventId)) as { title: string; owner_id: number } | undefined;
  if (event) await notify(event.owner_id, `${user.name} recusou o convite para o evento "${event.title}".`, ret);
  await audit(user.id, "event.invite_declined", "event", eventId);
  back(ret, "msg", "Convite recusado.");
}

export async function adminApproveEvent(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("event_id"));
  const done = await approveEvent(id);
  if (!done) back("/admin/eventos", "error", "Este evento nao esta aguardando aprovacao.");
  await audit(null, "event.approved_by_admin", "event", id);
  back("/admin/eventos", "msg", `Evento "${done.event.title}" aprovado.${done.invites ? ` ${done.invites} convite(s) enviado(s).` : ""}`);
}

export async function adminRejectEvent(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("event_id"));
  const reason = str(formData, "reason").slice(0, REJECT_REASON_MAX);
  if (!reason) back("/admin/eventos", "error", "Escreva o motivo da recusa. A pessoa vai receber esse texto.");
  const event = await rejectEvent(id, reason);
  if (!event) back("/admin/eventos", "error", "Este evento nao esta aguardando aprovacao.");
  await audit(null, "event.rejected_by_admin", "event", id);
  back("/admin/eventos", "msg", `Evento "${event.title}" recusado. A pessoa foi avisada.`);
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
  const ret = ["/meus-eventos", "/dashboard", "/eventos-participantes"].includes(back_to) ? back_to : `/eventos/${eventId}`;
  const db = getDb();
  const reg = (await db.prepare(
    `SELECT r.id, r.status, r.checked_in_at, e.title, e.owner_id, e.starts_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.event_id = ? AND r.user_id = ? AND e.status = 'published'`
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
       WHERE r.id = ? AND e.owner_id = ? AND e.status = 'published'`
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
     WHERE r.id = ? AND r.status = 'approved' AND e.owner_id = ? AND e.status = 'published'`
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
  const ret = presenceReturn(formData);
  const db = getDb();
  const row = (await db.prepare(
    `SELECT r.id, r.checked_in_at, e.title, e.owner_id, e.starts_at, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.user_id = ? AND r.status = 'approved' AND e.status = 'published'`
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

const CHECKOUT_CLOSED = "O check-out foi encerrado: ele vale ate 2 horas depois do fim do evento.";

export async function selfCheckOutEvent(formData: FormData) {
  const user = await me();
  const registrationId = Number(formData.get("registration_id"));
  const ret = presenceReturn(formData);
  const db = getDb();
  const row = (await db.prepare(
    `SELECT r.id, r.checked_out_at, e.title, e.owner_id, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.user_id = ? AND r.status = 'approved' AND r.checked_in_at IS NOT NULL AND e.status = 'published'`
  ).get(registrationId, user.id)) as { id: number; checked_out_at: string | null; title: string; owner_id: number; ends_at: string } | undefined;
  if (!row) back(ret, "error", "Check-out indisponivel: ele so vale depois do seu check-in.");
  if (row.checked_out_at) back(ret, "msg", "Seu check-out ja estava registrado.");
  if (!checkOutOpen(row.ends_at)) back(ret, "error", CHECKOUT_CLOSED);
  const marked = await db.prepare("UPDATE event_registrations SET checked_out_at = datetime('now') WHERE id = ? AND checked_out_at IS NULL")
    .run(registrationId);
  if (!marked.changes) back(ret, "msg", "Seu check-out ja estava registrado.");
  await audit(user.id, "event.self_checked_out", "event_registration", registrationId);
  if (row.owner_id !== user.id) await notify(row.owner_id, `${user.name} fez check-out no evento "${row.title}".`, "/meus-eventos");
  back(ret, "msg", "Check-out registrado. O organizador foi avisado da sua saida.");
}

export async function checkOutEvent(formData: FormData) {
  const user = await me();
  if (!isEventOwner(user)) redirect("/dashboard");
  const registrationId = Number(formData.get("registration_id"));
  const db = getDb();
  const row = (await db.prepare(
    `SELECT r.id, r.checked_out_at, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.status = 'approved' AND r.checked_in_at IS NOT NULL AND e.owner_id = ? AND e.status = 'published'`
  ).get(registrationId, user.id)) as { id: number; checked_out_at: string | null; ends_at: string } | undefined;
  if (!row) back("/dashboard", "error", "Check-out indisponivel: ele so vale depois do check-in.");
  if (row.checked_out_at) back("/dashboard", "msg", "O check-out ja estava registrado.");
  if (!checkOutOpen(row.ends_at)) back("/dashboard", "error", CHECKOUT_CLOSED);
  await db.prepare("UPDATE event_registrations SET checked_out_at = COALESCE(checked_out_at, datetime('now')) WHERE id = ?").run(registrationId);
  await audit(user.id, "event.checked_out", "event_registration", registrationId);
  back("/dashboard", "msg", "Check-out registrado.");
}

export async function confirmSafeHome(formData: FormData) {
  const user = await me();
  const registrationId = Number(formData.get("registration_id"));
  const ret = presenceReturn(formData);
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

const MEETING_RETURN = ["/dashboard", "/encontros", "/minha-rede?aba=mentores", "/minha-rede?aba=mentorados", "/empresas"];

function meetingReturn(formData: FormData): string {
  const ret = str(formData, "return");
  return MEETING_RETURN.includes(ret) || parseMeetingRef(ret.replace(/^\/encontros\//, "")) && ret.startsWith("/encontros/") ? ret : "/dashboard";
}

async function tellMeetingPartner(userId: number, subject: string, text: string) {
  await notify(userId, text, "/encontros");
  await emailUser(userId, subject, text, "Ver encontros", "/encontros", "network");
}

const MEETING_ENTITY: Record<MeetingKind, string> = { mentorship: "mentorship_meeting", company: "company_meeting" };

export async function scheduleMentorshipMeeting(formData: FormData) {
  const user = await me();
  const kind: MeetingKind = str(formData, "kind") === "company" ? "company" : "mentorship";
  const linkId = Number(formData.get(kind === "company" ? "link_id" : formData.has("link_id") ? "link_id" : "mentorship_id"));
  const scheduledAt = str(formData, "scheduled_at");
  const duration = Number(formData.get("duration_minutes") || 60);
  const ret = meetingReturn(formData);
  const db = getDb();
  const link = (kind === "company"
    ? await db.prepare(
        "SELECT id, company_id AS a, member_id AS b FROM company_links WHERE id = ? AND status = 'active' AND (company_id = ? OR member_id = ?)"
      ).get(linkId, user.id, user.id)
    : await db.prepare(
        "SELECT id, mentor_id AS a, mentee_id AS b FROM mentorships WHERE id = ? AND status = 'active' AND (mentor_id = ? OR mentee_id = ?)"
      ).get(linkId, user.id, user.id)) as { id: number; a: number; b: number } | undefined;
  if (!link || !validDateTime(scheduledAt) || !Number.isInteger(duration) || duration < 15 || duration > 480) {
    back(ret, "error", "Nao foi possivel agendar este encontro.");
  }
  const result = kind === "company"
    ? await db.prepare(
        "INSERT INTO company_meetings (company_link_id, scheduled_at, duration_minutes, proposed_by) VALUES (?,?,?,?)"
      ).run(linkId, scheduledAt, duration, user.id)
    : await db.prepare(
        "INSERT INTO mentorship_meetings (mentorship_id, scheduled_at, duration_minutes, notes, proposed_by) VALUES (?,?,?,?,?)"
      ).run(linkId, scheduledAt, duration, str(formData, "notes"), user.id);
  await audit(user.id, `${kind}.meeting_scheduled`, MEETING_ENTITY[kind], Number(result.lastInsertRowid));
  const other = link!.a === user.id ? link!.b : link!.a;
  const what = kind === "company" ? "um encontro" : "um encontro de mentoria";
  await tellMeetingPartner(other, "Novo pedido de encontro", `${user.name} pediu ${what} para ${meetingTime(scheduledAt)}. Aceite, reagende ou cancele na pagina Encontros.`);
  back(ret, "msg", "Encontro solicitado. A outra pessoa foi avisada para aceitar.");
}

async function loadMeeting(userId: number, formData: FormData, ret: string): Promise<Meeting> {
  const kind = str(formData, "kind") === "company" ? "company" : "mentorship";
  const id = Number(formData.get("meeting_id"));
  const meeting = (await listMeetings(userId)).find((m) => m.kind === kind && m.id === id);
  if (!meeting) back(ret, "error", "Encontro nao encontrado.");
  return meeting;
}

function meetingWord(m: Meeting) {
  return m.kind === "company" ? "o encontro" : "o encontro de mentoria";
}

export async function confirmMentorshipMeeting(formData: FormData) {
  const user = await me();
  const ret = meetingReturn(formData);
  const m = await loadMeeting(user.id, formData, ret);
  if (!canConfirmMeeting(m, user.id)) back(ret, "error", "Este encontro nao esta aguardando a sua resposta.");
  await getDb().prepare(`UPDATE ${MEETING_TABLE[m.kind]} SET confirmed_at = datetime('now') WHERE id = ? AND status = 'scheduled' AND confirmed_at IS NULL`).run(m.id);
  await audit(user.id, `${m.kind}.meeting_confirmed`, MEETING_ENTITY[m.kind], m.id);
  await tellMeetingPartner(m.other_id, "Encontro aceito", `${user.name} aceitou ${meetingWord(m)} de ${meetingTime(m.scheduled_at)}.`);
  back(ret, "msg", "Encontro aceito. A outra pessoa foi avisada.");
}

export async function rescheduleMentorshipMeeting(formData: FormData) {
  const user = await me();
  const ret = meetingReturn(formData);
  const m = await loadMeeting(user.id, formData, ret);
  const scheduledAt = str(formData, "scheduled_at");
  const duration = Number(formData.get("duration_minutes") || m.duration_minutes);
  if (m.status !== "scheduled") back(ret, "error", "So e possivel reagendar encontros que ainda nao foram concluidos nem cancelados.");
  if (!validDateTime(scheduledAt) || !Number.isInteger(duration) || duration < 15 || duration > 480) back(ret, "error", "Informe a nova data e uma duracao entre 15 e 480 minutos.");
  await getDb().prepare(`UPDATE ${MEETING_TABLE[m.kind]} SET scheduled_at = ?, duration_minutes = ?, proposed_by = ?, confirmed_at = NULL WHERE id = ?`)
    .run(scheduledAt, duration, user.id, m.id);
  await audit(user.id, `${m.kind}.meeting_rescheduled`, MEETING_ENTITY[m.kind], m.id);
  await tellMeetingPartner(m.other_id, "Encontro reagendado", `${user.name} reagendou ${meetingWord(m)} para ${meetingTime(scheduledAt)}. Aceite, reagende ou cancele na pagina Encontros.`);
  back(ret, "msg", "Encontro reagendado. A outra pessoa foi avisada para aceitar.");
}

export async function cancelMentorshipMeeting(formData: FormData) {
  const user = await me();
  const ret = meetingReturn(formData);
  const m = await loadMeeting(user.id, formData, ret);
  if (m.status !== "scheduled") back(ret, "error", "Este encontro ja foi concluido ou cancelado.");
  if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para cancelar o encontro.");
  await getDb().prepare(`UPDATE ${MEETING_TABLE[m.kind]} SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'`).run(m.id);
  await audit(user.id, `${m.kind}.meeting_cancelled`, MEETING_ENTITY[m.kind], m.id);
  await tellMeetingPartner(m.other_id, "Encontro cancelado", `${user.name} cancelou ${meetingWord(m)} de ${meetingTime(m.scheduled_at)}.`);
  back(ret, "msg", "Encontro cancelado. A outra pessoa foi avisada.");
}

export async function completeMentorshipMeeting(formData: FormData) {
  const user = await me();
  const ret = meetingReturn(formData);
  const m = await loadMeeting(user.id, formData, ret);
  if (m.status !== "scheduled") back(ret, "error", "Este encontro ja foi concluido ou cancelado.");
  if (!meetingStarted(m.scheduled_at)) back(ret, "error", "O encontro so pode ser concluido depois do horario de inicio.");
  await getDb().prepare(`UPDATE ${MEETING_TABLE[m.kind]} SET status = 'completed' WHERE id = ? AND status = 'scheduled'`).run(m.id);
  await audit(user.id, `${m.kind}.meeting_completed`, MEETING_ENTITY[m.kind], m.id);
  await tellMeetingPartner(m.other_id, "Encontro concluido", `${user.name} marcou como concluido ${meetingWord(m)} de ${meetingTime(m.scheduled_at)}.`);
  back(ret, "msg", "Encontro concluido. Ele foi para o historico.");
}

const MEETING_TEXT_MAX = 2000;

async function meetingFromForm(userId: number, formData: FormData): Promise<{ m: Meeting; ret: string }> {
  const kind: MeetingKind = str(formData, "kind") === "company" ? "company" : "mentorship";
  const id = Number(formData.get("meeting_id"));
  const ret = Number.isInteger(id) && id > 0 ? meetingPath(kind, id) : "/encontros";
  const m = (await listMeetings(userId)).find((x) => x.kind === kind && x.id === id);
  if (!m) back("/encontros", "error", "Encontro nao encontrado.");
  return { m, ret };
}

function meetingText(formData: FormData, ret: string, min = 1): string {
  const body = str(formData, "body");
  if (body.length < min) back(ret, "error", "Escreva o texto antes de enviar.");
  if (body.length > MEETING_TEXT_MAX) back(ret, "error", `O texto pode ter no maximo ${MEETING_TEXT_MAX} caracteres.`);
  return body;
}

export async function saveMeetingNote(formData: FormData) {
  const user = await me();
  const { m, ret } = await meetingFromForm(user.id, formData);
  const body = meetingText(formData, ret, 0);
  const db = getDb();
  const col = MEETING_COL[m.kind];
  const existing = await db.prepare(`SELECT id FROM meeting_notes WHERE ${col} = ? AND author_id = ?`).get(m.id, user.id) as { id: number } | undefined;
  if (existing) await db.prepare("UPDATE meeting_notes SET body = ?, updated_at = datetime('now') WHERE id = ?").run(body, existing.id);
  else await db.prepare(`INSERT INTO meeting_notes (${col}, author_id, body) VALUES (?,?,?)`).run(m.id, user.id, body);
  back(ret, "msg", "Nota privada salva. So voce consegue ver.");
}

export async function addMeetingAgreement(formData: FormData) {
  const user = await me();
  const { m, ret } = await meetingFromForm(user.id, formData);
  if (m.status === "cancelled") back(ret, "error", "Nao e possivel acrescentar combinados em encontro cancelado.");
  const body = meetingText(formData, ret);
  const result = await getDb().prepare(`INSERT INTO meeting_agreements (${MEETING_COL[m.kind]}, author_id, body) VALUES (?,?,?)`).run(m.id, user.id, body);
  await audit(user.id, "meeting.agreement_added", "meeting_agreement", Number(result.lastInsertRowid));
  await notify(m.other_id, `${user.name} acrescentou um combinado ao encontro de ${meetingTime(m.scheduled_at)}.`, ret);
  back(ret, "msg", "Combinado acrescentado. A outra pessoa foi avisada.");
}

export async function toggleMeetingAgreement(formData: FormData) {
  const user = await me();
  const { m, ret } = await meetingFromForm(user.id, formData);
  const db = getDb();
  const id = Number(formData.get("agreement_id"));
  const a = await db.prepare(`SELECT id, done_at FROM meeting_agreements WHERE id = ? AND ${MEETING_COL[m.kind]} = ?`).get(id, m.id) as
    { id: number; done_at: string | null } | undefined;
  if (!a) back(ret, "error", "Combinado nao encontrado.");
  await db.prepare(`UPDATE meeting_agreements SET done_at = ${a!.done_at ? "NULL" : "datetime('now')"} WHERE id = ?`).run(id);
  await audit(user.id, a!.done_at ? "meeting.agreement_reopened" : "meeting.agreement_done", "meeting_agreement", id);
  back(ret, "msg", a!.done_at ? "Combinado reaberto." : "Combinado marcado como feito.");
}

export async function sendMeetingFeedback(formData: FormData) {
  const user = await me();
  const { m, ret } = await meetingFromForm(user.id, formData);
  if (m.status !== "completed") back(ret, "error", "O feedback abre depois que o encontro for concluido.");
  const body = meetingText(formData, ret, 2);
  const db = getDb();
  const col = MEETING_COL[m.kind];
  if (await db.prepare(`SELECT id FROM meeting_feedback WHERE ${col} = ? AND author_id = ?`).get(m.id, user.id)) back(ret, "error", "Voce ja enviou o seu feedback deste encontro.");
  const result = await db.prepare(`INSERT INTO meeting_feedback (${col}, author_id, body) VALUES (?,?,?)`).run(m.id, user.id, body);
  await audit(user.id, "meeting.feedback_sent", "meeting_feedback", Number(result.lastInsertRowid));
  await notify(m.other_id, `${user.name} deixou um feedback sobre o encontro de ${meetingTime(m.scheduled_at)}.`, ret);
  back(ret, "msg", "Feedback enviado. A outra pessoa foi avisada.");
}

export async function issueCertificate(formData: FormData) {
  const user = await me();
  if (!isEventOwner(user)) redirect("/dashboard");
  requireVerified(user, "/dashboard");
  const recipientId = Number(formData.get("recipient_id"));
  const eventId = Number(formData.get("event_id"));
  const db = getDb();
  const event = await db.prepare("SELECT id, title, ends_at, status FROM events WHERE id = ? AND owner_id = ?")
    .get(eventId, user.id) as { id: number; title: string; ends_at: string; status: string } | undefined;
  if (event?.status === "cancelled") back("/dashboard", "error", EVENT_CANCELLED);
  const attended = await db.prepare(
    "SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ? AND checked_in_at IS NOT NULL"
  ).get(eventId, recipientId);
  if (!event || !attended) back("/dashboard", "error", "Certificados so podem ser emitidos para participantes presentes.");
  if (!canIssueCertificate(event!.ends_at)) back("/dashboard", "error", CERTIFICATE_EXPIRED);
  const code = crypto.randomBytes(9).toString("hex").toUpperCase();
  const snap = await certificateSnapshot(eventId);
  try {
    const result = await db.prepare(
      `INSERT INTO certificates (user_id, event_id, issued_by, title, verification_code, workload_minutes, organizer_name, responsible_name, theme, responsible_signature)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(recipientId, eventId, user.id, event!.title, code, snap.workload, snap.organizer, snap.responsible, snap.theme, snap.signature);
    await audit(user.id, "certificate.issued", "certificate", Number(result.lastInsertRowid));
    await recordCertificateHistory(Number(result.lastInsertRowid), "issued", user.id);
  } catch {
    back("/dashboard", "error", "Ja existe certificado para esta pessoa neste evento.");
  }
  redirect(`/certificados/${code}`);
}

/** Carga horaria, organizador, responsavel, assinatura e modelo ficam gravados no certificado no momento da emissao. */
async function certificateSnapshot(eventId: number) {
  const e = (await getDb().prepare(
    `SELECT e.starts_at, e.ends_at, e.organizer, e.certificate_theme, u.name AS owner_name,
            COALESCE(u.signature_name, u.name) AS owner_signature
     FROM events e JOIN users u ON u.id = e.owner_id WHERE e.id = ?`
  ).get(eventId)) as { starts_at: string; ends_at: string; organizer: string; certificate_theme: string; owner_name: string; owner_signature: string };
  return {
    workload: workloadMinutes(e.starts_at, e.ends_at),
    organizer: e.organizer || e.owner_name,
    responsible: e.owner_name,
    signature: e.owner_signature,
    theme: validCertificateTheme(e.certificate_theme),
  };
}

const CERTIFICATE_EXPIRED = "O prazo para emitir o certificado terminou 1 ano apos o fim do evento.";
const EVENT_CANCELLED = "O evento foi cancelado: nao e possivel emitir certificado novo.";

export async function selfIssueCertificate(formData: FormData) {
  const user = await me();
  requireVerified(user, "/dashboard");
  const db = getDb();
  const reg = (await db.prepare(
    `SELECT r.event_id, e.title, e.ends_at, e.status FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ? AND r.user_id = ? AND r.checked_in_at IS NOT NULL`
  ).get(Number(formData.get("registration_id")), user.id)) as { event_id: number; title: string; ends_at: string; status: string } | undefined;
  if (!reg) back("/dashboard", "error", "Certificados so podem ser emitidos por quem fez check-in no evento.");
  const existing = (await db.prepare("SELECT verification_code FROM certificates WHERE user_id = ? AND event_id = ?")
    .get(user.id, reg!.event_id)) as { verification_code: string } | undefined;
  if (existing) redirect(`/certificados/${existing.verification_code}`);
  if (reg!.status === "cancelled") back("/dashboard", "error", EVENT_CANCELLED);
  if (!canIssueCertificate(reg!.ends_at)) back("/dashboard", "error", CERTIFICATE_EXPIRED);
  const code = crypto.randomBytes(9).toString("hex").toUpperCase();
  const snap = await certificateSnapshot(reg!.event_id);
  try {
    const result = await db.prepare(
      `INSERT INTO certificates (user_id, event_id, issued_by, title, verification_code, workload_minutes, organizer_name, responsible_name, theme, responsible_signature)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(user.id, reg!.event_id, user.id, reg!.title, code, snap.workload, snap.organizer, snap.responsible, snap.theme, snap.signature);
    await audit(user.id, "certificate.self_issued", "certificate", Number(result.lastInsertRowid));
    await recordCertificateHistory(Number(result.lastInsertRowid), "self_issued", user.id);
  } catch {
    back("/dashboard", "error", "Ja existe certificado seu neste evento.");
  }
  redirect(`/certificados/${code}`);
}

const REVOKE_RETURN = ["/dashboard", "/meus-eventos", "/certificados?aba=emitidos"];
type RevokeTarget = { id: number; user_id: number; title: string; verification_code: string; revoked_at: string | null };

/** Quem cadastrou o evento (ownerId) ou a administracao (ownerId null) revoga ou desfaz a revogacao. */
async function revokeTarget(formData: FormData, ownerId: number | null, ret: string): Promise<RevokeTarget> {
  const id = Number(formData.get("certificate_id"));
  const c = (await getDb().prepare(
    `SELECT c.id, c.user_id, c.title, c.verification_code, c.revoked_at FROM certificates c LEFT JOIN events e ON e.id = c.event_id
     WHERE c.id = ?${ownerId === null ? "" : " AND e.owner_id = ?"}`
  ).get(...(ownerId === null ? [id] : [id, ownerId]))) as RevokeTarget | undefined;
  if (!c) back(ret, "error", "Certificado nao encontrado ou voce nao pode altera-lo.");
  return c;
}

async function applyRevoke(formData: FormData, ownerId: number | null, ret: string): Promise<never> {
  const c = await revokeTarget(formData, ownerId, ret);
  if (c.revoked_at) back(ret, "msg", "Este certificado ja estava revogado.");
  const parsed = revokeReason(str(formData, "reason"), str(formData, "details"));
  if ("error" in parsed) back(ret, "error", parsed.error);
  const done = await getDb().prepare(
    "UPDATE certificates SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL"
  ).run(ownerId, parsed.reason, c.id);
  if (!done.changes) back(ret, "msg", "Este certificado ja estava revogado.");
  await audit(ownerId, ownerId === null ? "certificate.revoked_by_admin" : "certificate.revoked", "certificate", c.id);
  await recordCertificateHistory(c.id, "revoked", ownerId, ownerId === null, parsed.reason);
  const link = `/certificados/${c.verification_code}`;
  const text = `Seu certificado de "${c.title}" foi revogado ${ownerId === null ? "pela administracao" : "pela organizacao do evento"}. Motivo: ${parsed.reason}.`;
  await notify(c.user_id, text, link);
  await emailUser(c.user_id, `Certificado revogado: ${c.title}`, text, "Ver certificado", link, "network");
  back(ret, "msg", "Certificado revogado. A pessoa foi avisada.");
}

async function applyUnrevoke(formData: FormData, ownerId: number | null, ret: string): Promise<never> {
  const c = await revokeTarget(formData, ownerId, ret);
  const done = await getDb().prepare("UPDATE certificates SET revoked_at = NULL WHERE id = ? AND revoked_at IS NOT NULL").run(c.id);
  if (!done.changes) back(ret, "msg", "Este certificado ja estava valido.");
  await audit(ownerId, ownerId === null ? "certificate.unrevoked_by_admin" : "certificate.unrevoked", "certificate", c.id);
  await recordCertificateHistory(c.id, "unrevoked", ownerId, ownerId === null);
  const link = `/certificados/${c.verification_code}`;
  const text = `A revogacao do seu certificado de "${c.title}" foi desfeita. Ele voltou a ser valido, com o mesmo codigo.`;
  await notify(c.user_id, text, link);
  await emailUser(c.user_id, `Certificado valido de novo: ${c.title}`, text, "Ver certificado", link, "network");
  back(ret, "msg", "Revogacao desfeita. O certificado voltou a ser valido e a pessoa foi avisada.");
}

export async function revokeCertificate(formData: FormData) {
  const user = await me();
  const ret = REVOKE_RETURN.includes(str(formData, "return")) ? str(formData, "return") : "/meus-eventos";
  await applyRevoke(formData, user.id, ret);
}

export async function unrevokeCertificate(formData: FormData) {
  const user = await me();
  const ret = REVOKE_RETURN.includes(str(formData, "return")) ? str(formData, "return") : "/meus-eventos";
  await applyUnrevoke(formData, user.id, ret);
}

export async function adminRevokeCertificate(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  await applyRevoke(formData, null, "/admin/certificados");
}

export async function adminUnrevokeCertificate(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  await applyUnrevoke(formData, null, "/admin/certificados");
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

function minutesAgoUtc(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

/** Avisa no sino (1 aviso nao lido por conversa) e por e-mail (no maximo 1 por conversa a cada hora), sem o texto da mensagem. */
async function notifyMessage(c: ConversationRow, toId: number, subject: string, text: string) {
  const link = `/mensagens?c=${c.id}`;
  const db = getDb();
  if (!(await db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND link = ? AND read_at IS NULL").get(toId, link))) await notify(toId, text, link);
  const col = c.user_a === toId ? "emailed_a_at" : "emailed_b_at";
  const claimed = await db.prepare(`UPDATE conversations SET ${col} = datetime('now') WHERE id = ? AND (${col} IS NULL OR ${col} < ?)`).run(c.id, minutesAgoUtc(MESSAGE_EMAIL_GAP_MIN));
  if (claimed.changes) await emailUser(toId, subject, `${text} Entre na Ponte para ler e responder.`, "Abrir mensagens", link, "network");
}

export async function sendMessage(formData: FormData) {
  const user = await me();
  const convId = Number(formData.get("conversation_id")) || 0;
  let toId = Number(formData.get("to")) || 0;
  const ret = convId ? `/mensagens?c=${convId}` : `/pessoas/${toId}`;
  requireVerified(user, ret);
  const body = String(formData.get("body") ?? "").trim();
  const problem = messageProblem(body);
  if (problem) back(ret, "error", problem);
  const limit = { action: "message", subject: `user:${user.id}`, ...MESSAGE_LIMIT };
  const wait = await blockedFor([limit]);
  if (wait) back(ret, "error", `Voce enviou muitas mensagens em pouco tempo. Aguarde ${wait} minuto${wait > 1 ? "s" : ""} e tente de novo.`);
  const db = getDb();
  let c: ConversationRow | undefined;
  if (convId) {
    c = await getConversation(convId, user.id);
    if (!c) back("/mensagens", "error", "Conversa nao encontrada.");
    toId = otherOf(c!, user.id) ?? 0;
    if (!toId) back(ret, "error", "Esta conta foi excluida. Nao e possivel enviar mensagens.");
  } else {
    if (toId === user.id) back(ret, "error", "Voce nao pode enviar mensagem para si.");
    if (!(await db.prepare("SELECT 1 FROM users WHERE id = ? AND account_status = 'active'").get(toId))) back("/mensagens", "error", "Pessoa nao encontrada.");
    c = await conversationBetween(user.id, toId);
  }
  if (await blockedBetween(user.id, toId)) back(ret, "error", "Nao e possivel enviar mensagens para esta pessoa.");
  const direct = await canMessageDirect(user.id, toId);
  let status: "open" | "requested" = "open";
  if (!c) {
    status = direct ? "open" : "requested";
    const [a, b] = pair(user.id, toId);
    await db.prepare("INSERT INTO conversations (user_a, user_b, status, requested_by) VALUES (?,?,?,?)").run(a, b, status, user.id);
    c = await conversationBetween(user.id, toId);
  } else if (c.status !== "open") {
    if (!direct && c.status === "requested")
      back(ret, "error", c.requested_by === user.id ? "Seu pedido de contato ainda nao foi aceito. Aguarde a resposta." : "Aceite o pedido de contato para responder.");
    if (!direct && c.requested_by === user.id) back(ret, "error", "A pessoa nao aceitou o pedido de contato.");
    await db.prepare("UPDATE conversations SET status = 'open' WHERE id = ?").run(c.id);
  }
  await db.prepare("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)").run(c!.id, user.id, body);
  await db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(c!.id);
  await recordAttempt("message", [limit.subject]);
  if (status === "open") {
    await notifyMessage(c!, toId, `Nova mensagem de ${user.name}`, `${user.name} enviou uma mensagem para voce.`);
    redirect(`/mensagens?c=${c!.id}`);
  }
  await notifyMessage(c!, toId, `${user.name} pediu contato`, `${user.name} pediu contato com voce e enviou uma primeira mensagem.`);
  back(`/mensagens?c=${c!.id}`, "msg", "Pedido de contato enviado. A conversa abre quando a pessoa aceitar.");
}

export async function respondContactRequest(formData: FormData) {
  const user = await me();
  const id = Number(formData.get("conversation_id"));
  const c = await getConversation(id, user.id);
  if (!c || c.status !== "requested" || c.requested_by === user.id) back("/mensagens", "error", "Pedido de contato nao encontrado.");
  if (str(formData, "decision") === "accept") {
    await getDb().prepare("UPDATE conversations SET status = 'open' WHERE id = ? AND status = 'requested'").run(id);
    if (c!.requested_by) await notify(c!.requested_by, `${user.name} aceitou seu pedido de contato.`, `/mensagens?c=${id}`);
    back(`/mensagens?c=${id}`, "msg", "Pedido aceito. Agora voces podem conversar.");
  }
  await getDb().prepare("UPDATE conversations SET status = 'declined' WHERE id = ? AND status = 'requested'").run(id);
  back("/mensagens", "msg", "Pedido de contato recusado.");
}

const REPORT_RETURN = /^\/(pessoas|projetos|eventos)\/\d+$|^\/mensagens(\?c=\d+)?$|^\/encontros\/(mentoria|empresa)-\d+$/;

export async function submitReport(formData: FormData) {
  const user = await me();
  const ret = REPORT_RETURN.test(str(formData, "return")) ? str(formData, "return") : "/dashboard";
  const type = str(formData, "target_type") as ReportTarget;
  const targetId = Number(formData.get("target_id")) || 0;
  const reason = str(formData, "reason");
  const details = String(formData.get("details") ?? "").trim();
  const problem = reportProblem(reason, details);
  if (problem) back(ret, "error", problem);
  const limit = { action: "report", subject: `user:${user.id}`, ...REPORT_LIMIT };
  const wait = await blockedFor([limit]);
  if (wait) back(ret, "error", tooManyMessage(wait));
  const db = getDb();
  let target: { user_id: number | null; label: string; body?: string | null } | undefined;
  if (type === "user") {
    target = (await db.prepare("SELECT id AS user_id, name AS label FROM users WHERE id = ?").get(targetId)) as typeof target;
  } else if (type === "message") {
    target = (await db.prepare(
      `SELECT m.sender_id AS user_id, COALESCE(u.name, 'Conta excluida') AS label, m.body FROM messages m
       JOIN conversations c ON c.id = m.conversation_id LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.id = ? AND (c.user_a = ? OR c.user_b = ?) AND (m.sender_id IS NULL OR m.sender_id <> ?) AND m.body IS NOT NULL`
    ).get(targetId, user.id, user.id, user.id)) as typeof target;
  } else if (type === "project") {
    target = (await db.prepare("SELECT owner_id AS user_id, title AS label FROM projects WHERE id = ?").get(targetId)) as typeof target;
  } else if (type === "event") {
    target = (await db.prepare("SELECT owner_id AS user_id, title AS label FROM events WHERE id = ?").get(targetId)) as typeof target;
  } else if (type === "attachment") {
    const a = await getAttachment(targetId);
    if (a && (await canViewAttachment(a, user))) target = { user_id: a.owner_id, label: a.title || a.filename };
  }
  if (!target) back(ret, "error", "Nao encontramos o que voce quer denunciar.");
  if (target!.user_id === user.id) back(ret, "error", "Voce nao pode denunciar a si mesmo.");
  await db.prepare(
    "INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, target_label, message_body, reason, details) VALUES (?,?,?,?,?,?,?,?)"
  ).run(user.id, type, targetId, target!.user_id, target!.label, type === "message" ? target!.body ?? null : null, reason, details);
  await recordAttempt("report", [limit.subject]);
  const row = (await db.prepare("SELECT MAX(id) AS id FROM reports WHERE reporter_id = ?").get(user.id)) as { id: number };
  await audit(user.id, "report.created", "report", row.id);
  await alertAdmin(`Nova denuncia: ${REPORT_REASONS[reason as keyof typeof REPORT_REASONS]}`);
  back(ret, "msg", "Denuncia enviada. A administracao vai analisar, e a pessoa nao fica sabendo quem denunciou.");
}

export async function blockUser(formData: FormData) {
  const user = await me();
  const targetId = Number(formData.get("user_id")) || 0;
  const ret = REPORT_RETURN.test(str(formData, "return")) || str(formData, "return") === "/meus-dados" ? str(formData, "return") : "/meus-dados";
  if (targetId === user.id) back(ret, "error", "Voce nao pode bloquear a si mesmo.");
  if (!(await getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(targetId))) back(ret, "error", "Pessoa nao encontrada.");
  if (str(formData, "decision") === "unblock") {
    await getDb().prepare("DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?").run(user.id, targetId);
    await audit(user.id, "user.unblocked", "user", targetId);
    back(ret, "msg", "Pessoa desbloqueada.");
  }
  if (!(await getDb().prepare("SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?").get(user.id, targetId))) {
    await getDb().prepare("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)").run(user.id, targetId);
    await audit(user.id, "user.blocked", "user", targetId);
  }
  back(ret, "msg", "Pessoa bloqueada. Ela nao pode mais enviar mensagens, pedidos de contato nem convites para voce, e nao e avisada.");
}

export async function adminReviewReport(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("report_id"));
  await getDb().prepare("UPDATE reports SET status = 'reviewing' WHERE id = ? AND status = 'open'").run(id);
  await audit(null, "report.reviewing", "report", id);
  back("/admin/denuncias", "msg", "Denuncia marcada como em analise.");
}

export async function adminCloseReport(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("report_id"));
  const outcome = str(formData, "outcome") as ReportOutcome;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!["archived", "warned", "suspended"].includes(outcome)) back("/admin/denuncias", "error", "Escolha a medida.");
  const db = getDb();
  const r = (await db.prepare("SELECT * FROM reports WHERE id = ? AND status <> 'closed'").get(id)) as
    { id: number; reporter_id: number | null; target_user_id: number | null } | undefined;
  if (!r) back("/admin/denuncias", "error", "Denuncia nao encontrada ou ja concluida.");
  if (outcome !== "archived" && !r!.target_user_id) back("/admin/denuncias", "error", "A conta denunciada nao existe mais. Arquive a denuncia.");
  await db.prepare("UPDATE reports SET status = 'closed', outcome = ?, admin_note = ?, closed_at = datetime('now') WHERE id = ?").run(outcome, note, id);
  const target = r!.target_user_id;
  if (outcome === "warned" && target) {
    const text = "Voce recebeu uma advertencia da administracao da Ponte por uma conduta que descumpre o Codigo de Conduta. Leia o Codigo de Conduta e siga as regras da comunidade.";
    await notify(target, text, "/conduta");
    await emailUser(target, "Advertencia da administracao da Ponte", text, "Ler o Codigo de Conduta", "/conduta", "essential");
  }
  if (outcome === "suspended" && target) {
    await db.prepare("UPDATE users SET account_status = 'suspended' WHERE id = ? AND account_status = 'active'").run(target);
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target);
    await emailUser(target, "Sua conta na Ponte foi suspensa", "Sua conta foi suspensa pela administracao da Ponte por descumprir o Codigo de Conduta. Enquanto ela estiver suspensa, voce nao consegue entrar. Se quiser contestar, fale com o administrador.", "Ler o Codigo de Conduta", "/conduta", "essential");
  }
  if (r!.reporter_id) await notify(r!.reporter_id, "A administracao analisou e concluiu a sua denuncia. Obrigada por ajudar a cuidar da comunidade.", "/dashboard");
  await audit(null, `report.closed ${outcome}`, "report", id);
  back("/admin/denuncias", "msg", "Denuncia concluida.");
}

export async function adminUnsuspendUser(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("user_id"));
  const done = await getDb().prepare("UPDATE users SET account_status = 'active' WHERE id = ? AND account_status = 'suspended'").run(id);
  if (!done.changes) back("/admin/denuncias", "error", "Esta conta nao esta suspensa.");
  await audit(null, "user.unsuspended", "user", id);
  await emailUser(id, "Sua conta na Ponte foi reativada", "A administracao desfez a suspensao da sua conta. Voce ja pode entrar de novo.", "Entrar", "/login", "essential");
  back("/admin/denuncias", "msg", "Suspensao desfeita. A pessoa pode entrar de novo.");
}

export async function adminConfirmUserEmail(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("user_id"));
  const path = `/admin/usuarios/${id}`;
  if (!(await adminConfirmEmail(id))) back(path, "error", "Este e-mail nao esta aguardando confirmacao.");
  await audit(null, "email.verified_by_admin", "user", id);
  back(path, "msg", "E-mail confirmado. A pessoa ja pode usar todas as funcoes.");
}

export async function adminDelete(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const kind = str(formData, "kind") as DeleteKind;
  const id = Number(formData.get("id"));
  if (!DELETE_KINDS.includes(kind) || !Number.isInteger(id) || id <= 0) back("/admin", "error", "Item invalido.");
  const ret = `/admin/excluir/${kind}/${id}`;
  const reason = str(formData, "reason").slice(0, DELETE_REASON_MAX);
  if (reason.length < 3) back(ret, "error", "Escreva o motivo da exclusao.");
  if (formData.get("confirm") !== "1") back(ret, "error", "Marque a confirmacao para excluir definitivamente.");
  const done = await deleteAsAdmin(kind, id, reason);
  if (!done) back("/admin", "error", "Nao encontrado. Talvez ja tenha sido excluido.");
  back(done.list, "msg", `${DELETE_KIND_PT[kind]} "${done.title}" excluido(a) definitivamente. Motivo registrado.`);
}

export async function submitReview(formData: FormData) {
  const user = await me();
  const kind = str(formData, "kind") === "event" ? "event" : "mentorship";
  const targetId = Number(formData.get("target_id")) || 0;
  const ending = kind === "mentorship" && str(formData, "encerrar") === "1";
  const ret = `/avaliar?${kind === "event" ? "evento" : "mentoria"}=${targetId}${ending ? "&encerrar=1" : ""}`;
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();
  const sensitive = formData.get("sensitive") === "on";
  const sensitiveText = sensitive ? String(formData.get("sensitive_text") ?? "").trim() : "";
  const problem = reviewProblem(rating, comment, sensitive, sensitiveText);
  if (problem) back(ret, "error", problem);
  const yesNo = (k: string) => (str(formData, k) === "1" ? 1 : str(formData, k) === "0" ? 0 : null);
  let subject: { id: number; role: string; label: string; reportType: ReportTarget; reportId: number };
  if (kind === "mentorship") {
    const t = await mentorshipReviewTarget(user.id, targetId);
    if (!t) back("/dashboard", "error", "Esta mentoria ainda nao pode ser avaliada. A avaliacao abre depois do primeiro encontro concluido.");
    subject = { id: t!.other_id, role: t!.other_side, label: t!.other_name, reportType: "user", reportId: t!.other_id };
    if (yesNo("as_agreed") === null || yesNo("recommend") === null) back(ret, "error", "Responda as duas perguntas.");
  } else {
    const t = await eventReviewTarget(user.id, targetId);
    if (!t) back(`/eventos/${targetId}`, "error", "A avaliacao e so para quem fez check-in, ate 30 dias depois do fim do evento.");
    subject = { id: t!.owner_id, role: "organizer", label: t!.title, reportType: "event", reportId: t!.id };
  }
  const limit = { action: "report", subject: `user:${user.id}`, ...REPORT_LIMIT };
  if (sensitive) {
    const wait = await blockedFor([limit]);
    if (wait) back(ret, "error", tooManyMessage(wait));
  }
  const db = getDb();
  const existing = await myReview(user.id, kind, targetId);
  const agreed = kind === "mentorship" ? yesNo("as_agreed") : null;
  const recommend = kind === "mentorship" ? yesNo("recommend") : null;
  if (existing) {
    await db.prepare("UPDATE reviews SET rating = ?, comment = ?, as_agreed = ?, recommend = ?, updated_at = datetime('now') WHERE id = ?")
      .run(rating, comment, agreed, recommend, existing.id);
    await audit(user.id, "review.updated", "review", existing.id);
  } else {
    const r = await db.prepare(
      `INSERT INTO reviews (author_id, kind, ${kind === "event" ? "event_id" : "mentorship_id"}, subject_id, subject_role, rating, comment, as_agreed, recommend) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(user.id, kind, targetId, subject!.id, subject!.role, rating, comment, agreed, recommend);
    await audit(user.id, "review.created", "review", Number(r.lastInsertRowid));
  }
  if (sensitive) {
    await db.prepare(
      "INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, target_label, reason, details, sensitive) VALUES (?,?,?,?,?,'relato_sensivel',?,1)"
    ).run(user.id, subject!.reportType, subject!.reportId, subject!.id, subject!.label, sensitiveText);
    await recordAttempt("report", [limit.subject]);
    const row = (await db.prepare("SELECT MAX(id) AS id FROM reports WHERE reporter_id = ?").get(user.id)) as { id: number };
    await audit(user.id, "report.created sensitive", "report", row.id);
    await alertAdmin("Novo relato sensivel recebido numa avaliacao");
  }
  const note = sensitive ? " O relato sensivel foi enviado em sigilo para a administracao." : "";
  if (ending) {
    await db.prepare("DELETE FROM mentorships WHERE id = ? AND (mentor_id = ? OR mentee_id = ?)").run(targetId, user.id, user.id);
    back("/dashboard", "msg", `Avaliacao enviada e conexao removida.${note}`);
  }
  back(kind === "event" ? `/eventos/${targetId}` : "/dashboard", "msg", `${existing ? "Avaliacao alterada." : "Avaliacao enviada."}${note}`);
}

function attachTarget(formData: FormData): AttachTarget {
  const scope = (ATTACH_SCOPES as readonly string[]).includes(str(formData, "scope")) ? (str(formData, "scope") as AttachScope) : "profile";
  const target = Number(formData.get("target_id")) || 0;
  return { scope, projectId: target, eventId: target, meetingId: target, meetingKind: str(formData, "meeting_kind") === "company" ? "company" : "mentorship" };
}

export async function uploadAttachment(formData: FormData) {
  const user = await me();
  const t = attachTarget(formData);
  const ret = attachmentPath(t);
  const denied = await uploadDenied(t, user);
  if (denied) back(ret, "error", denied);
  const limit = { action: "attachment", subject: `user:${user.id}`, ...ATTACH_LIMIT };
  const wait = await blockedFor([limit]);
  if (wait) back(ret, "error", tooManyMessage(wait));
  const file = formData.get("file");
  if (!(file instanceof File)) back(ret, "error", "Escolha um arquivo.");
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const type = sniffType(bytes);
  const problem = fileProblem(bytes.length, type, t.scope);
  if (problem) back(ret, "error", problem);
  const db = getDb();
  const [where, params] = whereFor({ ...t, ownerId: t.scope === "resume" || t.scope === "profile" || t.scope === "event_evidence" ? user.id : undefined });
  const count = Number(((await db.prepare(`SELECT COUNT(*) AS n FROM attachments a WHERE ${where}`).get(...params)) as { n: number }).n);
  if (count >= SCOPE_MAX[t.scope]) {
    back(ret, "error", t.scope === "resume" || t.scope === "event_evidence" ? "Voce ja enviou este arquivo. Remova o atual para enviar outro." : `O limite aqui e de ${SCOPE_MAX[t.scope]} arquivos. Remova um para enviar outro.`);
  }
  if ((await userAttachmentBytes(user.id)) + bytes.length > ATTACH_USER_TOTAL) back(ret, "error", "Voce chegou ao limite de 12 MB em arquivos. Remova algum para enviar outro.");
  const siteBytes = await siteAttachmentBytes();
  if (siteBytes + bytes.length > ATTACH_SITE_TOTAL) back(ret, "error", "O espaco para arquivos da Ponte esta cheio no momento. Tente de novo mais tarde.");
  const name = (file as File).name || "arquivo";
  const title = str(formData, "title").slice(0, ATTACH_TITLE_MAX) || (t.scope === "resume" ? "Curriculo" : name.replace(/\.[^.]*$/, "").slice(0, ATTACH_TITLE_MAX));
  const col = t.scope === "project" ? "project_id" : t.scope === "meeting" ? (t.meetingKind === "company" ? "company_meeting_id" : "mentorship_meeting_id") : t.scope.startsWith("event_") ? "event_id" : null;
  const r = await db.prepare(
    `INSERT INTO attachments (owner_id, scope, ${col ? `${col}, ` : ""}title, filename, mime, size, data) VALUES (?,?,${col ? "?," : ""}?,?,?,?,?)`
  ).run(...[user.id, t.scope, ...(col ? [t.projectId ?? 0] : []), title, safeFilename(name, type!), type!, bytes.length, Buffer.from(bytes).toString("base64")]);
  await recordAttempt("attachment", [limit.subject]);
  await audit(user.id, "attachment.uploaded", "attachment", Number(r.lastInsertRowid));
  if (crossesSiteWarning(siteBytes, bytes.length)) {
    await alertAdmin(`Os arquivos enviados chegaram a ${Math.round(((siteBytes + bytes.length) / ATTACH_SITE_TOTAL) * 100)}% do limite de 300 MB do site. Ao chegar em 100%, novos envios serao recusados.`);
  }
  back(ret, "msg", "Arquivo enviado.");
}

export async function removeAttachment(formData: FormData) {
  const user = await me();
  const a = await getAttachment(Number(formData.get("attachment_id")) || 0);
  const ret = a ? attachmentPath({ scope: a.scope, projectId: a.project_id ?? 0, eventId: a.event_id ?? 0, meetingKind: a.company_meeting_id ? "company" : "mentorship", meetingId: a.company_meeting_id ?? a.mentorship_meeting_id ?? 0 }) : "/perfil#arquivos";
  if (!a || !(await canRemoveAttachment(a, user.id))) back(ret, "error", "Arquivo nao encontrado.");
  await getDb().prepare("DELETE FROM attachments WHERE id = ?").run(a!.id);
  await audit(user.id, "attachment.removed", "attachment", a!.id);
  back(ret, "msg", "Arquivo removido.");
}

export async function adminRemoveAttachment(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = Number(formData.get("attachment_id")) || 0;
  const done = await getDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
  if (done.changes) await audit(null, "admin.attachment_removed", "attachment", id);
  back("/admin/denuncias", "msg", done.changes ? "Arquivo removido. Conclua a denuncia com a medida escolhida." : "O arquivo ja tinha sido removido.");
}
