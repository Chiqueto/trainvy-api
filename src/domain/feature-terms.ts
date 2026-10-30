import { createHash } from "node:crypto";

export const featureKeys = ["AI_WORKOUT", "EXERCISE_3D"] as const;
export type FeatureKey = (typeof featureKeys)[number];
const common =
  "Este aceite é opcional e se aplica somente a este recurso. Você pode cancelar e continuar usando as demais funções. O aceite não representa renúncia a direitos nem exclui responsabilidades legais do Trainvy. Registramos sua conta, data e hora, versão e texto do termo, endereço IP e navegador para comprovar o aceite e auditar o uso do recurso. Este aceite não autoriza acesso ao histórico de treinos: essa preferência é separada.";
const definitions = {
  AI_WORKOUT: {
    title: "Antes de gerar um treino com IA",
    text:
      "Estou ciente de que os treinos sugeridos por inteligência artificial podem conter erros, omissões ou recomendações inadequadas às minhas condições e não substituem avaliação, prescrição e acompanhamento por profissional de Educação Física habilitado, nem avaliação de saúde quando necessária. A IA não realiza exame físico, diagnóstico ou avaliação clínica. Devo revisar e posso editar a proposta antes de salvar; salvar ou aceitar o termo não significa aprovação profissional. Recomenda-se a revisão de um profissional antes de executar o treino. Não devo usar a IA para tratar lesões ou condições de saúde. Se houver dor, mal-estar ou dúvida sobre segurança, devo interromper a atividade e procurar orientação profissional. " +
      common,
  },
  EXERCISE_3D: {
    title: "Antes de visualizar exercícios em 3D",
    text:
      "Estou ciente de que as animações 3D são ilustrações educativas simplificadas e podem conter imprecisões de anatomia, postura, amplitude, equipamento ou movimento. Não são uma avaliação da minha execução nem substituem orientação de profissional de Educação Física habilitado. As cores indicam apenas grupos musculares ilustrativos; não medem ativação muscular, EMG ou esforço real. Não devo reproduzir automaticamente a amplitude, a carga ou a cadência da animação; a execução deve considerar minhas condições e orientação profissional. Em caso de dor, mal-estar ou dúvida, devo interromper a atividade e procurar orientação. " +
      common,
  },
};

export function getFeatureTerms(feature: FeatureKey) {
  const definition = definitions[feature];
  return {
    feature,
    version: "2026-10-30.1",
    ...definition,
    textHash: createHash("sha256")
      .update(definition.title + "\n" + definition.text)
      .digest("hex"),
  };
}

export class FeatureTermsError extends Error {
  constructor(
    public code: "FEATURE_TERMS_REQUIRED" | "FEATURE_TERMS_CHANGED",
    public statusCode: 428 | 409 = 428,
  ) {
    super(
      code === "FEATURE_TERMS_CHANGED"
        ? "O termo foi atualizado. Leia e aceite a versão atual."
        : "Leia e aceite o termo antes de continuar.",
    );
  }
}
