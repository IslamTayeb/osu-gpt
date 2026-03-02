import { useMemo, useState } from "react";
import {
  generatorParamTemplate,
  mapTypePresets,
  mapperStylePresets,
  type MapperStylePreset,
} from "@/lib/generatorConfig";
import type { GeneratorParams } from "@/lib/types";
import type { StylePresetOption, UpdateGeneratorParam } from "@/components/workspace/right-pane/types";

type UseGenerationProfileConfigResult = {
  stylePresetId: string;
  stylePresetOptions: StylePresetOption[];
  selectedStylePresetDescription: string;
  applyStylePreset: (nextPresetId: string) => void;
  mapperChoiceId: string;
  mapperStyleOptions: MapperStylePreset[];
  selectedMapperOptionDescription: string;
  applyMapperChoice: (nextMapperChoiceId: string) => void;
  updateCustomMapperId: (rawValue: string) => void;
  generatorParams: GeneratorParams;
  updateGeneratorParam: UpdateGeneratorParam;
};

export function useGenerationProfileConfig(): UseGenerationProfileConfigResult {
  const [stylePresetId, setStylePresetId] = useState("none");
  const [mapperChoiceId, setMapperChoiceId] = useState("none");
  const [generatorParams, setGeneratorParams] = useState<GeneratorParams>({
    ...generatorParamTemplate,
  });

  const stylePresetOptions = useMemo<StylePresetOption[]>(
    () => [
      {
        id: "none",
        label: "No style preset",
        description: "No auto style changes. Keep current parameters.",
        descriptors: [],
        defaults: {},
      },
      ...mapTypePresets.map((presetOption) => ({
        id: `type:${presetOption.id}`,
        label: presetOption.label,
        description: presetOption.description,
        descriptors: presetOption.descriptors,
        defaults: presetOption.defaults,
      })),
      ...mapperStylePresets.map((presetOption) => ({
        id: `mapper:${presetOption.id}`,
        label: `${presetOption.label} (example style)`,
        description: presetOption.description,
        descriptors: presetOption.descriptors,
        defaults: {},
      })),
    ],
    [],
  );

  const selectedStylePreset = useMemo(
    () =>
      stylePresetOptions.find((presetOption) => presetOption.id === stylePresetId) ?? stylePresetOptions[0],
    [stylePresetId, stylePresetOptions],
  );

  const selectedMapperOption = useMemo(
    () => mapperStylePresets.find((presetOption) => presetOption.id === mapperChoiceId) ?? null,
    [mapperChoiceId],
  );

  const updateGeneratorParam: UpdateGeneratorParam = (key, value) => {
    setGeneratorParams((previous) => ({ ...previous, [key]: value }));
  };

  function applyStylePreset(nextPresetId: string) {
    setStylePresetId(nextPresetId);
    const presetOption = stylePresetOptions.find((item) => item.id === nextPresetId);
    if (!presetOption) {
      return;
    }
    setGeneratorParams((previous) => ({
      ...previous,
      ...presetOption.defaults,
      descriptors: presetOption.descriptors,
    }));
  }

  function applyMapperChoice(nextMapperChoiceId: string) {
    setMapperChoiceId(nextMapperChoiceId);
    if (nextMapperChoiceId === "none") {
      updateGeneratorParam("mapperId", null);
      return;
    }
    if (nextMapperChoiceId === "other") {
      return;
    }
    const mapperOption = mapperStylePresets.find((item) => item.id === nextMapperChoiceId);
    if (mapperOption) {
      updateGeneratorParam("mapperId", mapperOption.mapperId);
    }
  }

  function updateCustomMapperId(rawValue: string) {
    setMapperChoiceId("other");
    updateGeneratorParam("mapperId", rawValue === "" ? null : Number(rawValue));
  }

  return {
    stylePresetId,
    stylePresetOptions,
    selectedStylePresetDescription: selectedStylePreset?.description ?? "",
    applyStylePreset,
    mapperChoiceId,
    mapperStyleOptions: mapperStylePresets,
    selectedMapperOptionDescription: selectedMapperOption?.description ?? "",
    applyMapperChoice,
    updateCustomMapperId,
    generatorParams,
    updateGeneratorParam,
  };
}
