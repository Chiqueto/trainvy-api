import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import z from "zod";

import { AuthorizeCoachAthleteProgressAccess } from "./AuthorizeCoachAthleteProgressAccess.js";
import { GetCoachAthleteProgressOverview } from "./GetCoachAthleteProgressOverview.js";

export interface GetCoachAthleteProgressInsightsInput {
  coachId: string;
  athleteId: string;
  tz: string;
  weeksCount?: number;
}

export interface MuscleBalanceInsight {
  muscleGroup: string;
  status: "BALANCED" | "OVERTRAINED" | "UNDERTRAINED" | "ATTENTION";
  observation: string;
}

export interface GetCoachAthleteProgressInsightsOutput {
  athleteId: string;
  athleteName: string;
  periodWeeks: number;
  summary: string;
  consistencyAssessment: string;
  highlights: string[];
  warnings: string[];
  muscleBalanceInsights: MuscleBalanceInsight[];
  recommendations: string[];
  suggestedFocusForNextPrescription: string;
  generatedAt: string;
}

const AiInsightsObjectSchema = z.object({
  summary: z.string(),
  consistencyAssessment: z.string(),
  highlights: z.array(z.string()),
  warnings: z.array(z.string()),
  muscleBalanceInsights: z.array(
    z.object({
      muscleGroup: z.string(),
      status: z.enum(["BALANCED", "OVERTRAINED", "UNDERTRAINED", "ATTENTION"]),
      observation: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
  suggestedFocusForNextPrescription: z.string(),
});

export class GetCoachAthleteProgressInsights {
  async execute(
    input: GetCoachAthleteProgressInsightsInput
  ): Promise<GetCoachAthleteProgressInsightsOutput> {
    const authContext = await new AuthorizeCoachAthleteProgressAccess().execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
    });

    const getOverview = new GetCoachAthleteProgressOverview();
    const overview = await getOverview.execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
      tz: input.tz,
      weeksCount: input.weeksCount,
    });

    const weeks = input.weeksCount ?? 4;
    const athleteName = authContext.athlete.name;

    // Caso o aluno não tenha treinos registrados no período
    if (overview.summary.totalWorkouts === 0) {
      return {
        athleteId: input.athleteId,
        athleteName,
        periodWeeks: weeks,
        summary: `Nenhum treino concluído foi registrado para ${athleteName} no período de ${weeks} semana(s).`,
        consistencyAssessment:
          "Sem histórico suficiente de treinos realizados nesta janela temporal.",
        highlights: [
          "Vínculo ativo e consentimento de evolução concedido pelo atleta.",
        ],
        warnings: [
          "O aluno ainda não registrou sessões no tracker ou os treinos foram anteriores ao período autorizado.",
        ],
        muscleBalanceInsights: [],
        recommendations: [
          "Incentive o aluno a registrar as primeiras sessões de treino utilizando o tracker do Trainvy.",
          "Verifique se o aluno prefere treinos planejados ou avulsos para iniciar a rotina.",
        ],
        suggestedFocusForNextPrescription:
          "Elaborar prescrição inicial adaptada ao nível atual do aluno.",
        generatedAt: new Date().toISOString(),
      };
    }

    // Prepara resumo analítico dos dados reais para a IA
    const muscleDistributionText = (overview.muscles?.muscles || [])
      .map(
        (g) =>
          `- ${g.muscleGroup}: ${g.directWorkingSets} séries diretas, ${g.indirectWorkingSets} séries indiretas`
      )
      .join("\n");

    const weeklyTrendText = (overview.weekly?.weeks || [])
      .map(
        (w, idx) =>
          `Semana ${idx + 1} (${w.weekStartDate} a ${w.weekEndDate}): ${w.workoutsCompleted} treinos, ${w.workingSets} séries válidas, ${w.loadVolumeKg} kg de volume de carga.`
      )
      .join("\n");

    const promptContext = `
Dados do Aluno:
- Nome: ${athleteName}
- Período Analisado: Últimas ${weeks} semanas
- Total de Treinos Concluídos: ${overview.summary.totalWorkouts}
- Frequência Média Semanal: ${overview.summary.weeklyFrequency} treinos/semana
- Total de Séries Válidas (working sets): ${overview.summary.totalWorkingSets}
- Volume Total de Carga Levantada: ${overview.summary.totalLoadVolumeKg} kg
- Duração Média da Sessão: ${Math.round(overview.summary.averageDurationInSeconds / 60)} minutos

Evolução Semanal:
${weeklyTrendText}

Distribuição de Séries por Grupamento Muscular:
${muscleDistributionText}
`;

    try {
      const { object } = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: AiInsightsObjectSchema,
        system: `Você é um consultor sênior de inteligência artificial em fisiologia do exercício, biomecânica e periodização de musculação do Trainvy.
Sua missão é analisar dados reais de histórico de treinos de um aluno para fornecer um diagnóstico analítico de alto nível para o seu Personal Trainer.

Diretrizes obrigatórias:
1. Respostas profissionais, técnicas, construtivas e fundamentadas nas ciências do treinamento resistido (hipertrofia e força).
2. Identifique desequilíbrios na relação agonista/antagonista (ex: peito vs costas, quadríceps vs posteriores de coxa).
3. Avalie a consistência semanal e se o volume por grupamento muscular está dentro das faixas ótimas (10 a 20 séries semanais por músculo alvo para hipertrofia).
4. Forneça recomendações práticas e acionáveis que o Personal Trainer possa aplicar diretamente na próxima prescrição de treino.
5. Seja direto, conciso e evite clichês vazios.`,
        prompt: `Analise as métricas reais do aluno abaixo e gere o diagnóstico completo de evolução para o treinador:\n${promptContext}`,
      });

      return {
        athleteId: input.athleteId,
        athleteName,
        periodWeeks: weeks,
        summary: object.summary,
        consistencyAssessment: object.consistencyAssessment,
        highlights: object.highlights,
        warnings: object.warnings,
        muscleBalanceInsights: object.muscleBalanceInsights,
        recommendations: object.recommendations,
        suggestedFocusForNextPrescription:
          object.suggestedFocusForNextPrescription,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // Fallback analítico determinístico caso a API externa sofra instabilidade
      return {
        athleteId: input.athleteId,
        athleteName,
        periodWeeks: weeks,
        summary: `${athleteName} completou ${overview.summary.totalWorkouts} treinos com média de ${overview.summary.weeklyFrequency} treinos/semana e volume acumulado de ${overview.summary.totalLoadVolumeKg} kg.`,
        consistencyAssessment:
          overview.summary.weeklyFrequency >= 3
            ? "Boa regularidade e consistência semanal mantida."
            : "Frequência abaixo de 3 treinos por semana; oportunidade de ganho de consistência.",
        highlights: [
          `Total de ${overview.summary.totalWorkingSets} séries de trabalho executadas no período.`,
          `Volume total de carga movimentada de ${overview.summary.totalLoadVolumeKg} kg.`,
        ],
        warnings: [
          "Verificar distribuição de volume entre empurrar e puxar na próxima prescrição.",
        ],
        muscleBalanceInsights: (overview.muscles?.muscles || [])
          .slice(0, 4)
          .map((g) => ({
            muscleGroup: g.muscleGroup,
            status: g.directWorkingSets >= 10 ? "BALANCED" : "ATTENTION",
            observation: `${g.directWorkingSets} séries diretas no período.`,
          })),
        recommendations: [
          "Manter a progressão gradual de volume de treino.",
          "Adequar intervalos de descanso entre 90s e 180s para exercícios multiarticulares.",
        ],
        suggestedFocusForNextPrescription:
          "Periodização com foco em progressão de carga e equilíbrio muscular.",
        generatedAt: new Date().toISOString(),
      };
    }
  }
}
