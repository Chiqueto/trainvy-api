import z from "zod";

const controllerName = "Luís Felipe Mozer Chiqueto";
const defaultEntityName = `Trainvy (operado por ${controllerName})`;
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && !value.trim() ? undefined : value;

export const legalIdentitySchema = z.object({
  LEGAL_ENTITY_NAME: z.preprocess(
    blankToUndefined,
    z.string().trim().min(1).default(defaultEntityName),
  ),
  LEGAL_CONTACT_EMAIL: z.preprocess(
    blankToUndefined,
    z.email().default("lfchiqueto@gmail.com"),
  ),
});

export const legalIdentity = legalIdentitySchema.parse(process.env);

// Keep the supplied contractual wording with the default identity. A configured
// legal entity replaces the controller's name in every contractual occurrence.
export function renderLegalIdentity(template: string) {
  const name =
    legalIdentity.LEGAL_ENTITY_NAME === defaultEntityName
      ? controllerName
      : legalIdentity.LEGAL_ENTITY_NAME;
  const escapeMarkdown = (value: string) =>
    value.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&").replace(/[\r\n]+/g, " ");
  return template
    .replaceAll("{{LEGAL_CONTROLLER_NAME}}", escapeMarkdown(name))
    .replaceAll("{{LEGAL_CONTACT_EMAIL}}", legalIdentity.LEGAL_CONTACT_EMAIL);
}
