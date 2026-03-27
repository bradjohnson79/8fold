export type MessagePersona = "contractor" | "job_poster";

export type MessageGenerationPayload = {
  leadId: string;
  email?: string | null;
  category?: string | null;
  city?: string | null;
  persona: MessagePersona;
  force_regenerate?: boolean;
};

export type MessageGenerationApiResponse = {
  ok?: boolean;
  reason?: string;
  error?: string;
  data?: {
    id?: string;
    skipped?: boolean;
    warning?: string | null;
    limited_data?: boolean;
    missing_fields?: string[];
  };
  warning?: string | null;
  missing_fields?: string[];
};

export function hasLimitedMessageContext(fields: {
  email?: string | null;
  category?: string | null;
  city?: string | null;
  company?: string | null;
  contact?: string | null;
}): boolean {
  return !fields.email || !fields.category || !fields.city || (!fields.company && !fields.contact);
}

export function getGenerateErrorMessage(status: number, response?: MessageGenerationApiResponse): string {
  if (response?.reason === "missing_data") return "Using limited data — message may be generic";
  if (status >= 500) return "Generation failed, try again";
  return response?.error ?? "Generate failed";
}
