const OPENROUTER_API = "https://openrouter.ai/api/v1";

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  created: number;
  pricing: {
    prompt: string;
    completion: string;
    image: string;
    request: string;
  };
  architecture: {
    modality: string;
    tokenizer: string;
  };
  top_provider: {
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  supported_parameters: string[];
}

export interface ModelsListResponse {
  data: OpenRouterModel[];
}

/**
 * Get API key from environment or config
 */
async function getApiKey(): Promise<string | undefined> {
  // Check environment variable first
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // Try to read from config
  try {
    const { readConfigFile } = await import("../utils");
    const config = await readConfigFile();

    // Find openrouter provider
    const provider = config.Providers?.find(
      (p: any) => p.name === "openrouter" || p.name === "openrouter-free"
    );

    if (provider?.api_key) {
      // Interpolate environment variables
      const apiKey = provider.api_key.replace(
        /\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g,
        (match: string, braced: string, unbraced: string) => {
          const varName = braced || unbraced;
          return process.env[varName] || match;
        }
      );
      return apiKey;
    }
  } catch (error) {
    // Ignore config read errors
  }

  return undefined;
}

/**
 * Fetch all models from OpenRouter API (requires authentication)
 */
export async function fetchModels(): Promise<OpenRouterModel[]> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error(
      "OpenRouter API key not found. Set OPENROUTER_API_KEY environment variable or configure in config.json"
    );
  }

  const response = await fetch(`${OPENROUTER_API}/models/user`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as ModelsListResponse;
  return data.data;
}

/**
 * Check if a model is free (prompt and completion pricing are "0")
 */
export function isFreeModel(model: OpenRouterModel): boolean {
  const { pricing } = model;
  return pricing.prompt === "0" && pricing.completion === "0";
}

/**
 * Fetch only free models from OpenRouter
 */
export async function fetchFreeModels(): Promise<OpenRouterModel[]> {
  const models = await fetchModels();
  return models.filter(isFreeModel);
}

/**
 * Filter models by type/description
 */
export function filterModelsByType(
  models: OpenRouterModel[],
  type: string
): OpenRouterModel[] {
  const lowerType = type.toLowerCase();
  return models.filter(
    (model) =>
      model.description.toLowerCase().includes(lowerType) ||
      model.id.toLowerCase().includes(lowerType) ||
      model.name.toLowerCase().includes(lowerType)
  );
}

/**
 * Get model capabilities summary
 */
export function getModelCapabilities(model: OpenRouterModel): string[] {
  const capabilities: string[] = [];

  if (model.architecture.modality.includes("text")) {
    capabilities.push("text");
  }
  if (model.architecture.modality.includes("image")) {
    capabilities.push("image");
  }
  if (model.architecture.modality.includes("audio")) {
    capabilities.push("audio");
  }

  return capabilities;
}
