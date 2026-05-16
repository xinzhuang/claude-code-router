import {
  fetchFreeModels,
  filterModelsByType,
  OpenRouterModel,
} from "../utils/openrouter";
import { readConfigFile, writeConfigFile } from "../utils";

interface FreeCommandOptions {
  update?: boolean;
  type?: string;
  json?: boolean;
  recent?: number;
}

/**
 * Format date from timestamp
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split("T")[0];
}

/**
 * Build parameter support text
 */
function buildParamText(supportedParams: string[]): string {
  const keyMap: Record<string, [string, string]> = {
    tools: ["Tools", "✓"],
    reasoning: ["Reason", "✓"],
    structured_outputs: ["Struct", "✓"],
  };

  const parts: string[] = [];
  for (const [param, [label]] of Object.entries(keyMap)) {
    const check = supportedParams.includes(param) ? "✓" : "✗";
    parts.push(`${label}:${check}`);
  }

  return parts.join("  ");
}

/**
 * Display free models in a formatted table
 */
function displayModels(models: OpenRouterModel[], title: string = "Free Models"): void {
  console.log(`\n🆕 ${title} (${models.length} models):\n`);

  // Table header
  console.log(
    "Date       Model ID                                      Ctx        Modality           Key Params"
  );
  console.log("─".repeat(120));

  models.forEach((model) => {
    const date = formatDate(model.created);
    const ctx = model.context_length.toLocaleString();
    const modality = model.architecture.modality;
    const params = buildParamText(model.supported_parameters || []);

    console.log(
      `${date}  ${model.id.padEnd(45)} ${ctx.padStart(10)}  ${modality.padEnd(18)} ${params}`
    );
  });

  console.log("");
}

/**
 * Display top models with details
 */
function displayTopModels(models: OpenRouterModel[]): void {
  console.log("🏆 Top Free Models (by creation time):\n");

  // Table header
  console.log(
    "#   Date       Model ID                                      Name                                   Ctx        Key Params"
  );
  console.log("─".repeat(140));

  models.forEach((model, index) => {
    const date = formatDate(model.created);
    const ctx = model.context_length.toLocaleString();
    const params = buildParamText(model.supported_parameters || []);
    const name = (model.name || "").substring(0, 35);

    console.log(
      `${String(index + 1).padStart(2)}  ${date}  ${model.id.padEnd(45)} ${name.padEnd(38)} ${ctx.padStart(10)} ${params}`
    );
  });

  console.log("");

  // Detail panels
  console.log("📋 Model Details:\n");

  models.forEach((model) => {
    console.log(`┌─ ${model.id}`);
    console.log("│");

    if (model.description) {
      const desc = model.description.substring(0, 200);
      console.log(`│  ${desc}`);
    }

    console.log(
      `│  Context: ${model.context_length.toLocaleString()}  |  Modality: ${model.architecture.modality}`
    );

    const params = model.supported_parameters || [];
    console.log(
      `│  All params (${params.length}): ${params.join(", ")}`
    );

    console.log("│  💰 Free");
    console.log("└─");
    console.log("");
  });
}

/**
 * Display models as JSON
 */
function displayModelsJson(models: OpenRouterModel[]): void {
  const output = models.map((model) => ({
    id: model.id,
    name: model.name,
    created: model.created,
    created_date: formatDate(model.created),
    context_length: model.context_length,
    max_completion_tokens: model.top_provider.max_completion_tokens,
    modality: model.architecture.modality,
    supported_parameters: model.supported_parameters,
    is_moderated: model.top_provider.is_moderated,
    description: model.description,
  }));
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Update config with free models
 */
async function updateConfig(models: OpenRouterModel[]): Promise<void> {
  const config = await readConfigFile();

  // Find or create openrouter-free provider
  let freeProvider = config.Providers?.find(
    (p: any) => p.name === "openrouter-free"
  );

  if (!freeProvider) {
    freeProvider = {
      name: "openrouter-free",
      api_base_url: "https://openrouter.ai/api/v1/chat/completions",
      api_key: "$OPENROUTER_API_KEY",
      models: [],
      transformer: {
        use: ["openrouter"],
      },
    };

    if (!config.Providers) {
      config.Providers = [];
    }
    config.Providers.push(freeProvider);
  }

  // Update models list
  freeProvider.models = models.map((m) => m.id);

  await writeConfigFile(config);
}

/**
 * Handle the free command
 */
export async function handleFreeCommand(
  args: string[] = []
): Promise<void> {
  // Parse arguments
  const options: FreeCommandOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--update" || arg === "-u") {
      options.update = true;
    } else if (arg === "--type" || arg === "-t") {
      options.type = args[++i];
    } else if (arg === "--json" || arg === "-j") {
      options.json = true;
    } else if (arg === "--recent" || arg === "-r") {
      options.recent = parseInt(args[++i], 10) || 3;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: ccr free [options]

Options:
  --update, -u      Update config with free models
  --type, -t        Filter by model type (coding, chat, etc.)
  --recent, -r N    Show models created in last N days (default: 3)
  --json, -j        Output as JSON
  --help, -h        Show help information

Examples:
  ccr free                    # List all free models
  ccr free --update           # Update config with free models
  ccr free --type coding      # Filter by type
  ccr free --recent 7         # Show models from last 7 days
  ccr free --json             # Output as JSON
      `);
      return;
    }
  }

  try {
    console.log("Fetching free models from OpenRouter...");
    let freeModels = await fetchFreeModels();

    if (freeModels.length === 0) {
      console.log("No free models found.");
      return;
    }

    // Filter by recent days if specified
    if (options.recent) {
      const cutoff = Date.now() / 1000 - options.recent * 86400;
      freeModels = freeModels.filter((m) => m.created >= cutoff);
      if (freeModels.length === 0) {
        console.log(
          `No free models found in the last ${options.recent} days.`
        );
        return;
      }
    }

    // Sort by creation time (newest first)
    freeModels.sort((a, b) => b.created - a.created);

    // Apply type filter if specified
    if (options.type) {
      freeModels = filterModelsByType(freeModels, options.type);
      if (freeModels.length === 0) {
        console.log(`No free models found matching type: ${options.type}`);
        return;
      }
    }

    // Display models
    if (options.json) {
      displayModelsJson(freeModels);
    } else {
      // Show recent models
      if (options.recent) {
        displayModels(
          freeModels,
          `New Free Models (last ${options.recent} days)`
        );
      } else {
        displayModels(freeModels);
      }

      // Show top 10
      const top10 = freeModels.slice(0, 10);
      if (top10.length > 0) {
        displayTopModels(top10);
      }
    }

    // Update config if requested
    if (options.update) {
      await updateConfig(freeModels);
      console.log("✅ Configuration updated with free models.");
      console.log('Run "ccr restart" to apply changes.');
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
