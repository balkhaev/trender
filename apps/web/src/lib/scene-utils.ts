import type { ElementSelection } from "@/components/flat-element-list";
import type { SceneSelection, VideoElement, VideoScene } from "./templates-api";

/**
 * Строит sceneSelections из выбранных элементов.
 * Определяет какие сцены затронуты на основе appearances элементов.
 * Возвращает в snake_case формате для API.
 */
export function buildSceneSelections(
  elements: VideoElement[],
  scenes: VideoScene[],
  selections: ElementSelection[]
): SceneSelection[] {
  const activeSelections = selections.filter(
    (s) => s.selectedOptionId !== null
  );
  if (activeSelections.length === 0) return [];

  // Собираем индексы затронутых сцен
  const affectedSceneIndexes = new Set<number>();
  for (const selection of activeSelections) {
    const element = elements.find((e) => e.id === selection.elementId);
    if (!(element && element.appearances)) continue;
    for (const appearance of element.appearances) {
      affectedSceneIndexes.add(appearance.sceneIndex);
    }
  }

  // Строим sceneSelections для каждой сцены (snake_case для API)
  return scenes.map((scene) => {
    if (affectedSceneIndexes.has(scene.index)) {
      // Сцена затронута - нужна генерация
      const sceneElementSelections = activeSelections
        .filter((sel) => {
          const el = elements.find((e) => e.id === sel.elementId);
          return el?.appearances?.some((a) => a.sceneIndex === scene.index);
        })
        .map((sel) => ({
          element_id: sel.elementId,
          selected_option_id: sel.selectedOptionId || undefined,
          custom_media_url: sel.customImageUrl,
        }));

      return {
        scene_id: scene.id,
        use_original: false,
        element_selections: sceneElementSelections,
      };
    }

    // Сцена не затронута - используем оригинал
    return {
      scene_id: scene.id,
      use_original: true,
    };
  });
}

/**
 * Проверяет можно ли использовать scene-based генерацию
 */
export function canUseSceneGeneration(
  scenes: VideoScene[] | undefined,
  selections: ElementSelection[]
): boolean {
  return (
    scenes !== undefined &&
    scenes.length > 0 &&
    selections.some((s) => s.selectedOptionId !== null)
  );
}
