/**
 * Renders SEO templates with variable substitution.
 * Variables use {variable_name} syntax. Missing variables resolve to empty string.
 *
 * Supported variables: job_title, city, region, trade, contractor_name, platform_name
 */
export function renderSeoTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = variables[key];
    return value != null && String(value).trim() !== "" ? String(value).trim() : "";
  });
}
