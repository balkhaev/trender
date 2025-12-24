/**
 * Фабрика для создания синглтонов сервисов
 */

type ServiceConfig = {
  isConfigured: () => boolean;
};

type ServiceSingleton<TService> = {
  getInstance: () => TService;
  resetInstance: () => void;
  isConfigured: () => boolean;
};

/**
 * Создает синглтон для сервиса с ленивой инициализацией
 */
export function createServiceSingleton<TService>(
  config: ServiceConfig,
  factory: () => TService,
  errorMessage: string
): ServiceSingleton<TService> {
  let instance: TService | null = null;

  return {
    getInstance: () => {
      if (!instance) {
        if (!config.isConfigured()) {
          throw new Error(errorMessage);
        }
        instance = factory();
      }
      return instance;
    },
    resetInstance: () => {
      instance = null;
    },
    isConfigured: config.isConfigured,
  };
}
