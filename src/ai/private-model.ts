import { google } from "@ai-sdk/google";
import { wrapLanguageModel } from "ai";

import {
  AI_SAFETY_PROMPT,
  sanitizePayloadForLLM,
} from "../domain/compliance.js";
import {
  assertAthleteHealthConsent,
  assertHealthConsent,
} from "../usecases/LegalCompliance.js";

// Runs on every provider step, including fresh tool results in multi-step chats.
export function privateModel(
  identities: string[] = [],
  consentUserId?: string,
  consentSubject: "SELF" | "ATHLETE" = "SELF",
) {
  return wrapLanguageModel({
    model: google("gemini-2.5-flash"),
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ params }) => {
        if (consentUserId) {
          if (consentSubject === "ATHLETE")
            await assertAthleteHealthConsent(consentUserId);
          else await assertHealthConsent(consentUserId);
        }
        return {
          ...params,
          prompt: [
            { role: "system" as const, content: AI_SAFETY_PROMPT },
            ...params.prompt.map((message) => {
              if (message.role === "system")
                return {
                  ...message,
                  content: sanitizePayloadForLLM(message.content, identities),
                };
              return {
                ...message,
                content: message.content.map((part) => {
                  if (part.type === "text")
                    return {
                      ...part,
                      text: sanitizePayloadForLLM(part.text, identities),
                    };
                  if (part.type === "tool-result")
                    return {
                      ...part,
                      output: sanitizePayloadForLLM(part.output, identities),
                    };
                  return part;
                }),
              };
            }),
          ] as typeof params.prompt,
        };
      },
    },
  });
}
