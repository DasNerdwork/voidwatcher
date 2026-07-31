import { useMemo } from "react";
import { I18nContext, browserLang, setActiveLangs } from ".";
import type { Lang } from ".";
import { oneOf, usePersistentState } from "../prefs";

const isLang = oneOf<Lang>(["de", "en"]);

/**
 * Hält die beiden Sprachwahlen und spiegelt sie in die Modulvariablen von
 * `i18n/index.ts`.
 *
 * Gesetzt wird **im Rendern**, nicht in einem Effekt: die Kinder rendern direkt
 * danach und würden sonst einen Durchgang lang die alte Sprache sehen.
 */
export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Oberfläche: beim allerersten Besuch die Browsersprache, danach die getroffene
  // Wahl. Item-Namen: fest Englisch als Vorgabe — unter englischen Namen wird
  // gehandelt, im Handelschat wie auf warframe.market selbst.
  const [ui, setUi]       = usePersistentState<Lang>("vw:lang-ui", browserLang(), isLang);
  const [items, setItems] = usePersistentState<Lang>("vw:lang-items", "en", isLang);

  setActiveLangs(ui, items);

  const value = useMemo(() => ({ ui, items, setUi, setItems }), [ui, items, setUi, setItems]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
