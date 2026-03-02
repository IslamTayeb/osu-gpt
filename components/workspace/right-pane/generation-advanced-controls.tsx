import type { ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { inContextOptions, negativeDescriptorOptions, outputTypeOptions } from "@/lib/homeUi";
import type { GeneratorParams } from "@/lib/types";
import type { UpdateGeneratorParam } from "./types";

type GenerationAdvancedControlsProps = {
  generatorParams: GeneratorParams;
  onUpdateGeneratorParam: UpdateGeneratorParam;
};

function selectedMultiValues(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
}

export function GenerationAdvancedControls({
  generatorParams,
  onUpdateGeneratorParam,
}: GenerationAdvancedControlsProps) {
  return (
    <details className="inline-help">
      <summary className="tiny muted">Advanced generator controls</summary>
      <div className="list">
        <div className="section-block generator-control">
          <span className="tiny muted">Slider multiplier (SV base). Typical: 1.2 - 1.8</span>
          <Input
            type="number"
            step={0.05}
            min={0.5}
            max={3}
            value={generatorParams.sliderMultiplier ?? ""}
            onChange={(event) =>
              onUpdateGeneratorParam(
                "sliderMultiplier",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
          />
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Slider tick rate. Typical: 1.0 - 2.0</span>
          <Input
            type="number"
            step={0.1}
            min={0.1}
            max={8}
            value={generatorParams.sliderTickRate ?? ""}
            onChange={(event) =>
              onUpdateGeneratorParam(
                "sliderTickRate",
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
          />
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Seed (integer, optional; blank = random)</span>
          <Input
            type="number"
            value={generatorParams.seed ?? ""}
            onChange={(event) =>
              onUpdateGeneratorParam("seed", event.target.value === "" ? null : Number(event.target.value))
            }
          />
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Device target (enum, optional)</span>
          <Select
            value={generatorParams.device ?? "auto"}
            onChange={(event) =>
              onUpdateGeneratorParam("device", event.target.value as GeneratorParams["device"])
            }
          >
            <option value="auto">auto</option>
            <option value="cuda">cuda</option>
            <option value="cpu">cpu</option>
            <option value="mps">mps</option>
          </Select>
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Precision (enum, optional)</span>
          <Select
            value={generatorParams.precision ?? "auto"}
            onChange={(event) =>
              onUpdateGeneratorParam("precision", event.target.value as GeneratorParams["precision"])
            }
          >
            <option value="auto">auto</option>
            <option value="fp16">fp16</option>
            <option value="bf16">bf16</option>
            <option value="fp32">fp32</option>
          </Select>
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Attention implementation (enum, optional)</span>
          <Select
            value={generatorParams.attnImplementation ?? "auto"}
            onChange={(event) =>
              onUpdateGeneratorParam(
                "attnImplementation",
                event.target.value as GeneratorParams["attnImplementation"],
              )
            }
          >
            <option value="auto">auto</option>
            <option value="sdpa">sdpa</option>
            <option value="flash_attention_2">flash_attention_2</option>
            <option value="eager">eager</option>
          </Select>
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Negative descriptors (multi-select)</span>
          <Select
            multiple
            size={7}
            value={generatorParams.negativeDescriptors ?? []}
            onChange={(event) => onUpdateGeneratorParam("negativeDescriptors", selectedMultiValues(event))}
          >
            {negativeDescriptorOptions.map((descriptor) => (
              <option key={descriptor} value={descriptor}>
                {descriptor}
              </option>
            ))}
          </Select>
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">In-context mode (multi-select)</span>
          <Select
            multiple
            size={4}
            value={generatorParams.inContext ?? []}
            onChange={(event) => onUpdateGeneratorParam("inContext", selectedMultiValues(event))}
          >
            {inContextOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
        <div className="section-block generator-control">
          <span className="tiny muted">Output type (multi-select)</span>
          <Select
            multiple
            size={3}
            value={generatorParams.outputType ?? []}
            onChange={(event) => onUpdateGeneratorParam("outputType", selectedMultiValues(event))}
          >
            {outputTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </details>
  );
}
