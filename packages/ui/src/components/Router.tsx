import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useConfig } from "./ConfigProvider";
import { Combobox } from "./ui/combobox";

export function Router() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();

  if (!config) {
    return (
      <Card className="flex h-full flex-col rounded-lg border shadow-sm">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-lg">{t("router.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <div className="text-gray-500">Loading router configuration...</div>
        </CardContent>
      </Card>
    );
  }

  const routerConfig = config.Router || {
    default: "",
    background: "",
    think: "",
    longContext: "",
    longContextThreshold: 60000,
    webSearch: "",
    image: "",
  };

  const fallbackConfig = config.fallback || {
    default: [],
    background: [],
    think: [],
    longContext: [],
    webSearch: [],
  };

  const handleRouterChange = (field: string, value: string | number) => {
    const currentRouter = config.Router || {};
    const newRouter = { ...currentRouter, [field]: value };
    setConfig({ ...config, Router: newRouter });
  };

  const handleForceUseImageAgentChange = (value: boolean) => {
    setConfig({ ...config, forceUseImageAgent: value });
  };

  const handleFallbackAdd = (scenario: string, modelValue: string) => {
    if (!modelValue) return;
    const currentList = fallbackConfig[scenario as keyof typeof fallbackConfig] || [];
    if (currentList.includes(modelValue)) return;
    const newFallback = {
      ...fallbackConfig,
      [scenario]: [...currentList, modelValue],
    };
    setConfig({ ...config, fallback: newFallback });
  };

  const handleFallbackRemove = (scenario: string, index: number) => {
    const currentList = [...(fallbackConfig[scenario as keyof typeof fallbackConfig] || [])];
    currentList.splice(index, 1);
    const newFallback = { ...fallbackConfig };
    if (currentList.length === 0) {
      delete newFallback[scenario as keyof typeof fallbackConfig];
    } else {
      (newFallback as Record<string, string[]>)[scenario] = currentList;
    }
    setConfig({ ...config, fallback: newFallback });
  };

  const providers = Array.isArray(config.Providers) ? config.Providers : [];

  const modelOptions = providers.flatMap((provider) => {
    if (!provider) return [];
    const models = Array.isArray(provider.models) ? provider.models : [];
    const providerName = provider.name || "Unknown Provider";
    return models.map((model) => ({
      value: `${providerName},${model || "Unknown Model"}`,
      label: `${providerName}, ${model || "Unknown Model"}`,
    }));
  });

  const formatModelLabel = (value: string) => {
    if (!value) return "";
    const parts = value.split(",");
    const provider = parts[0];
    const model = parts.slice(1).join(",");
    return `${provider} | ${model}`;
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="border-b p-4">
        <CardTitle className="text-lg">{t("router.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-5 overflow-y-auto p-4">
        {/* Default Model + Fallback */}
        <div className="space-y-2">
          <Label>{t("router.default")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.default || ""}
            onChange={(value) => handleRouterChange("default", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
          <FallbackList
            scenario="default"
            fallbackList={fallbackConfig.default || []}
            modelOptions={modelOptions}
            onAdd={handleFallbackAdd}
            onRemove={handleFallbackRemove}
            formatLabel={formatModelLabel}
          />
        </div>

        {/* Background Model + Fallback */}
        <div className="space-y-2">
          <Label>{t("router.background")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.background || ""}
            onChange={(value) => handleRouterChange("background", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
          <FallbackList
            scenario="background"
            fallbackList={fallbackConfig.background || []}
            modelOptions={modelOptions}
            onAdd={handleFallbackAdd}
            onRemove={handleFallbackRemove}
            formatLabel={formatModelLabel}
          />
        </div>

        {/* Think Model + Fallback */}
        <div className="space-y-2">
          <Label>{t("router.think")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.think || ""}
            onChange={(value) => handleRouterChange("think", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
          <FallbackList
            scenario="think"
            fallbackList={fallbackConfig.think || []}
            modelOptions={modelOptions}
            onAdd={handleFallbackAdd}
            onRemove={handleFallbackRemove}
            formatLabel={formatModelLabel}
          />
        </div>

        {/* Long Context Model + Fallback */}
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{t("router.longContext")}</Label>
              <Combobox
                options={modelOptions}
                value={routerConfig.longContext || ""}
                onChange={(value) => handleRouterChange("longContext", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            <div className="w-48">
              <Label>{t("router.longContextThreshold")}</Label>
              <Input
                type="number"
                value={routerConfig.longContextThreshold || 60000}
                onChange={(e) => handleRouterChange("longContextThreshold", parseInt(e.target.value) || 60000)}
                placeholder="60000"
              />
            </div>
          </div>
          <FallbackList
            scenario="longContext"
            fallbackList={fallbackConfig.longContext || []}
            modelOptions={modelOptions}
            onAdd={handleFallbackAdd}
            onRemove={handleFallbackRemove}
            formatLabel={formatModelLabel}
          />
        </div>

        {/* Web Search Model + Fallback */}
        <div className="space-y-2">
          <Label>{t("router.webSearch")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.webSearch || ""}
            onChange={(value) => handleRouterChange("webSearch", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
          <FallbackList
            scenario="webSearch"
            fallbackList={fallbackConfig.webSearch || []}
            modelOptions={modelOptions}
            onAdd={handleFallbackAdd}
            onRemove={handleFallbackRemove}
            formatLabel={formatModelLabel}
          />
        </div>

        {/* Image Model (no fallback) */}
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{t("router.image")} (beta)</Label>
              <Combobox
                options={modelOptions}
                value={routerConfig.image || ""}
                onChange={(value) => handleRouterChange("image", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            <div className="w-48">
              <Label htmlFor="forceUseImageAgent">{t("router.forceUseImageAgent")}</Label>
              <select
                id="forceUseImageAgent"
                value={config.forceUseImageAgent ? "true" : "false"}
                onChange={(e) => handleForceUseImageAgentChange(e.target.value === "true")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="false">{t("common.no")}</option>
                <option value="true">{t("common.yes")}</option>
              </select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Fallback list sub-component ── */

interface FallbackListProps {
  scenario: string;
  fallbackList: string[];
  modelOptions: { value: string; label: string }[];
  onAdd: (scenario: string, value: string) => void;
  onRemove: (scenario: string, index: number) => void;
  formatLabel: (value: string) => string;
}

function FallbackList({ scenario, fallbackList, modelOptions, onAdd, onRemove, formatLabel }: FallbackListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5">
      {/* Existing fallback chips */}
      {fallbackList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fallbackList.map((modelValue, index) => (
            <span
              key={`${modelValue}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
            >
              <span className="text-[10px] text-muted-foreground/60">{index + 1}.</span>
              {formatLabel(modelValue)}
              <button
                onClick={() => onRemove(scenario, index)}
                className="ml-0.5 rounded-sm p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                title={t("router.removeFallback")}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add fallback combobox */}
      <Combobox
        options={modelOptions.filter((opt) => !fallbackList.includes(opt.value))}
        value=""
        onChange={(value) => {
          if (value) {
            onAdd(scenario, value);
          }
        }}
        placeholder={t("router.addFallback")}
        searchPlaceholder={t("router.searchModel")}
        emptyPlaceholder={t("router.noModelFound")}
      />
    </div>
  );
}
