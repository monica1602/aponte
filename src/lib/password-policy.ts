export const PASSWORD_MIN = 8;
export const PASSWORD_HINT =
  "Minimo de 8 caracteres, com letra maiuscula, letra minuscula, numero e caractere especial (ex.: ! @ # $ %).";

const RULES: [RegExp, string][] = [
  [/\p{Lu}/u, "uma letra maiuscula"],
  [/\p{Ll}/u, "uma letra minuscula"],
  [/\p{N}/u, "um numero"],
  [/[^\p{L}\p{N}\s]/u, "um caractere especial"],
];

/** Retorna a mensagem de erro, ou null se a senha atende a politica. */
export function passwordProblem(password: string): string | null {
  const missing = RULES.filter(([re]) => !re.test(password)).map(([, label]) => label);
  if (password.length < PASSWORD_MIN) missing.unshift(`pelo menos ${PASSWORD_MIN} caracteres`);
  if (!missing.length) return null;
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} e ${missing.at(-1)}` : missing[0];
  return `A senha precisa ter ${list}.`;
}
